import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  bold,
  userMention,
} from 'discord.js';
import Plugin from '../../db/models/Plugin.js';
import {
  createLicense,
  getLicenseByKey,
  listLicenses,
  transferLicense,
} from '../../services/licenseService.js';
import {
  createLicenseCreatedEmbed,
  createLicenseEmbed,
  createLicenseListEmbed,
} from '../embeds/licenseEmbeds.js';
import {
  createErrorEmbed,
  createSuccessEmbed,
  createWarningEmbed,
} from '../embeds/commonEmbeds.js';
import { DURATION_PRESETS } from '../../utils/constants.js';
import { generateLicenseSchema, transferLicenseSchema } from '../../utils/validators.js';
import { pendingRevocations } from '../components/licenseButtons.js';
import { maskKey } from '../../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('license')
  .setDescription('Manage Minecraft plugin licenses')
  // 1. Generate Subcommand
  .addSubcommand((sub) =>
    sub
      .setName('generate')
      .setDescription('Generate a new license key')
      .addStringOption((opt) =>
        opt
          .setName('plugin')
          .setDescription('The plugin to link this license to')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addUserOption((opt) =>
        opt
          .setName('user')
          .setDescription('The Discord user to own this license')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('The license billing structure')
          .setRequired(true)
          .addChoices(
            { name: 'Lifetime', value: 'lifetime' },
            { name: 'Subscription', value: 'subscription' },
            { name: 'Trial', value: 'trial' },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName('duration')
          .setDescription('Duration (e.g. 1d, 7d, 30d, 90d, 365d) — ignored for lifetime')
          .setRequired(false),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('max-ips')
          .setDescription('Maximum concurrent whitelisted IPs allowed (default: 1)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(50),
      ),
  )
  // 2. Verify Subcommand
  .addSubcommand((sub) =>
    sub
      .setName('verify')
      .setDescription('Verify the status of a license key')
      .addStringOption((opt) =>
        opt.setName('key').setDescription('The license key to verify').setRequired(true),
      ),
  )
  // 3. Revoke Subcommand
  .addSubcommand((sub) =>
    sub
      .setName('revoke')
      .setDescription('Revoke an active license key')
      .addStringOption((opt) =>
        opt.setName('key').setDescription('The license key to revoke').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Optional reason for revocation').setRequired(false),
      ),
  )
  // 4. Transfer Subcommand
  .addSubcommand((sub) =>
    sub
      .setName('transfer')
      .setDescription('Transfer license ownership')
      .addStringOption((opt) =>
        opt.setName('key').setDescription('The license key to transfer').setRequired(true),
      )
      .addUserOption((opt) =>
        opt.setName('new-owner').setDescription('The new owner of the license').setRequired(true),
      ),
  )
  // 5. List Subcommand
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List licenses with filtering and pagination')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Filter licenses by owner').setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName('plugin')
          .setDescription('Filter licenses by plugin')
          .setRequired(false)
          .setAutocomplete(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('status')
          .setDescription('Filter by license status')
          .setRequired(false)
          .addChoices(
            { name: 'Active', value: 'active' },
            { name: 'Suspended', value: 'suspended' },
            { name: 'Revoked', value: 'revoked' },
            { name: 'Expired', value: 'expired' },
          ),
      ),
  );

/**
 * Handle autocomplete queries.
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'plugin') return;

  try {
    const list = await Plugin.find({
      $or: [
        { name: { $regex: focused.value, $options: 'i' } },
        { slug: { $regex: focused.value, $options: 'i' } },
      ],
    })
      .limit(25)
      .lean();

    await interaction.respond(
      list.map((p) => ({
        name: `${p.name} (${p.slug})`,
        value: p._id.toString(),
      })),
    );
  } catch {
    await interaction.respond([]);
  }
}

/**
 * Execute command actions.
 */
export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  // A. Generate License
  if (subcommand === 'generate') {
    const pluginId = interaction.options.getString('plugin');
    const user = interaction.options.getUser('user');
    const type = interaction.options.getString('type');
    const rawDuration = interaction.options.getString('duration');
    const maxIps = interaction.options.getInteger('max-ips') || 1;

    const validation = generateLicenseSchema.safeParse({
      pluginId,
      userId: user.id,
      type,
      duration: rawDuration || undefined,
      maxIps,
    });

    if (!validation.success) {
      const errEmbed = createErrorEmbed(
        'Validation Failed',
        'The parameters provided are malformed.',
      );
      return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    let duration = null;
    if (type !== 'lifetime') {
      if (!rawDuration) {
        const errEmbed = createErrorEmbed(
          'Missing Parameter',
          'Duration is required for non-lifetime license types.',
        );
        return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
      }

      const presetVal = DURATION_PRESETS[rawDuration.toLowerCase()];
      if (presetVal) {
        duration = presetVal.toString();
      } else {
        const customMs = parseInt(rawDuration, 10);
        if (isNaN(customMs) || customMs <= 0) {
          const errEmbed = createErrorEmbed(
            'Invalid Duration',
            'Please supply a preset (1d, 7d, 30d, 90d, 365d) or an integer duration in ms.',
          );
          return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }
        duration = customMs.toString();
      }
    }

    try {
      const license = await createLicense(
        {
          pluginId,
          ownerId: user.id,
          ownerTag: user.tag,
          type,
          duration,
          maxIps,
        },
        interaction.user.id,
      );

      const populated = await Plugin.findById(pluginId).lean();
      const licenseObj = license.toObject();
      licenseObj.pluginId = populated;

      const embed = createLicenseCreatedEmbed(licenseObj, license.key);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const errEmbed = createErrorEmbed('License Creation Failed', err.message);
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
    return;
  }

  // B. Verify License
  if (subcommand === 'verify') {
    const key = interaction.options.getString('key').trim();

    try {
      const license = await getLicenseByKey(key);
      if (!license) {
        const errEmbed = createErrorEmbed(
          'Not Found',
          'The requested license key does not exist in our registry.',
        );
        return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
      }

      const embed = createLicenseEmbed(license);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`check_status:${license.key}`)
          .setLabel('🔍 Check Status')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    } catch {
      const errEmbed = createErrorEmbed('Failed', 'An error occurred during query execution.');
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
    return;
  }

  // C. Revoke License
  if (subcommand === 'revoke') {
    const key = interaction.options.getString('key').trim();
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      const license = await getLicenseByKey(key);
      if (!license) {
        const errEmbed = createErrorEmbed('Not Found', 'The requested license key does not exist.');
        return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
      }

      if (license.status === 'revoked') {
        const errEmbed = createErrorEmbed(
          'Already Revoked',
          'This license has already been revoked.',
        );
        return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
      }

      pendingRevocations.set(interaction.user.id, { key, reason });

      const confirmEmbed = createWarningEmbed(
        'Confirm Revocation',
        `Are you sure you want to revoke license ${bold(maskKey(key))}?\nThis action is destructive and cannot be undone.`,
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_revoke')
          .setLabel('Confirm Revoke')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_revoke')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
    } catch {
      const errEmbed = createErrorEmbed('Failed', 'Failed to initialize revocation process.');
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
    return;
  }

  // D. Transfer License
  if (subcommand === 'transfer') {
    const key = interaction.options.getString('key').trim();
    const newOwner = interaction.options.getUser('new-owner');

    const validation = transferLicenseSchema.safeParse({ key, newOwnerId: newOwner.id });
    if (!validation.success) {
      const errEmbed = createErrorEmbed('Validation Failed', 'Inputs provided are malformed.');
      return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    try {
      const license = await transferLicense(key, newOwner.id, newOwner.tag, interaction.user.id);
      const embed = createSuccessEmbed(
        'License Transferred',
        `License key ${bold(maskKey(license.key))} has been successfully transferred to ${userMention(
          newOwner.id,
        )}.\n\nAll existing IP whitelists and Hardware bindings have been reset.`,
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const errEmbed = createErrorEmbed('Transfer Failed', err.message);
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
    return;
  }

  // E. List Licenses
  if (subcommand === 'list') {
    const user = interaction.options.getUser('user');
    const pluginId = interaction.options.getString('plugin');
    const status = interaction.options.getString('status');

    const ownerId = user ? user.id : null;

    try {
      const { licenses, page, totalPages } = await listLicenses({
        ownerId,
        pluginId,
        status,
        page: 1,
        limit: 10,
      });

      const embed = createLicenseListEmbed(licenses, page, totalPages);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`list:${ownerId || ''}:${pluginId || ''}:${status || ''}:${page - 1}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`list:${ownerId || ''}:${pluginId || ''}:${status || ''}:${page + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    } catch {
      const errEmbed = createErrorEmbed('Query Failed', 'Unable to retrieve license list.');
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
  }
}
