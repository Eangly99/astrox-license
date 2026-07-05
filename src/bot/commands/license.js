import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  bold,
  userMention,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import Plugin from '../../db/models/Plugin.js';
import {
  createLicense,
  getLicenseByKey,
  listLicenses,
  transferLicense,
  updateLicenseMaxIps,
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
import { generateLicenseSchema, transferLicenseSchema } from '../../utils/validators.js';
import { pendingRevocations } from '../components/licenseButtons.js';
import { maskKey, parseDuration } from '../../utils/formatters.js';

export const adminOnly = true;

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
          .setDescription('Max whitelisted IPs (-1 for unlimited, default: 1)')
          .setRequired(false)
          .setMinValue(-1)
          .setMaxValue(10000),
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
  )
  .addSubcommand((sub) =>
    sub.setName('bulk').setDescription('Open modal to generate licenses in bulk'),
  )
  .addSubcommand((sub) =>
    sub.setName('review').setDescription('Review and manage suspended licenses'),
  )
  .addSubcommand((sub) =>
    sub
      .setName('update')
      .setDescription('Update license settings (e.g. allowed IP count limit)')
      .addStringOption((opt) =>
        opt.setName('key').setDescription('The license key to update').setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('max-ips')
          .setDescription('Allowed concurrent IPs limit (-1 for unlimited)')
          .setRequired(true)
          .setMinValue(-1)
          .setMaxValue(10000),
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
      return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    let duration = null;
    if (type !== 'lifetime') {
      if (!rawDuration) {
        const errEmbed = createErrorEmbed(
          'Missing Parameter',
          'Duration is required for non-lifetime license types.',
        );
        return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      const parsedMs = parseDuration(rawDuration);
      if (!parsedMs) {
        const errEmbed = createErrorEmbed(
          'Invalid Duration',
          'Please supply a valid preset (e.g. 1d, 30d) or custom duration format (e.g. 12h, 2w, 30m).',
        );
        return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }
      duration = parsedMs.toString();
    }

    try {
      const license = await createLicense(
        {
          pluginId,
          ownerId: user.id,
          ownerTag: user.username,
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
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      const errEmbed = createErrorEmbed('License Creation Failed', err.message);
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
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
        return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      const embed = createLicenseEmbed(license);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`check_status:${license.key}`)
          .setLabel('🔍 Check Status')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      const errEmbed = createErrorEmbed('Failed', 'An error occurred during query execution.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
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
        return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      if (license.status === 'revoked') {
        const errEmbed = createErrorEmbed(
          'Already Revoked',
          'This license has already been revoked.',
        );
        return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      // Clear any existing timeout for this user first
      const existingPending = pendingRevocations.get(interaction.user.id);
      if (existingPending && existingPending.timeoutId) {
        clearTimeout(existingPending.timeoutId);
      }

      const timeoutId = setTimeout(() => {
        const entry = pendingRevocations.get(interaction.user.id);
        if (entry && entry.timeoutId === timeoutId) {
          pendingRevocations.delete(interaction.user.id);
        }
      }, 5 * 60 * 1000);

      pendingRevocations.set(interaction.user.id, {
        key,
        reason,
        expiresAt: Date.now() + 5 * 60 * 1000,
        timeoutId,
      });

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

      await interaction.reply({
        embeds: [confirmEmbed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      const errEmbed = createErrorEmbed('Failed', 'Failed to initialize revocation process.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
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
      return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    try {
      const license = await transferLicense(key, newOwner.id, newOwner.username, interaction.user.id);
      const embed = createSuccessEmbed(
        'License Transferred',
        `License key ${bold(maskKey(license.key))} has been successfully transferred to ${userMention(
          newOwner.id,
        )}.\n\nAll existing IP whitelists and Hardware bindings have been reset.`,
      );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      const errEmbed = createErrorEmbed('Transfer Failed', err.message);
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
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
          .setCustomId(`list|${ownerId || ''}|${pluginId || ''}|${status || ''}|${page - 1}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`list|${ownerId || ''}|${pluginId || ''}|${status || ''}|${page + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
      );

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      const errEmbed = createErrorEmbed('Query Failed', 'Unable to retrieve license list.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // F. Bulk Generate Modal
  if (subcommand === 'bulk') {
    const modal = new ModalBuilder()
      .setCustomId('bulk_generate_modal')
      .setTitle('Bulk License Generation');

    const pluginInput = new TextInputBuilder()
      .setCustomId('plugin_slug')
      .setLabel('Plugin Slug')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. my-plugin')
      .setRequired(true);

    const userIdsInput = new TextInputBuilder()
      .setCustomId('user_ids')
      .setLabel('Discord User IDs (one per line)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('e.g.\n123456789012345678\n987654321098765432')
      .setRequired(true);

    const typeInput = new TextInputBuilder()
      .setCustomId('license_type')
      .setLabel('Type (lifetime, subscription, trial)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('lifetime')
      .setRequired(true);

    const durationInput = new TextInputBuilder()
      .setCustomId('duration')
      .setLabel('Duration (e.g. 30d) - Ignored for Lifetime')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const maxIpsInput = new TextInputBuilder()
      .setCustomId('max_ips')
      .setLabel('Max IPs (default: 1)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(pluginInput),
      new ActionRowBuilder().addComponents(userIdsInput),
      new ActionRowBuilder().addComponents(typeInput),
      new ActionRowBuilder().addComponents(durationInput),
      new ActionRowBuilder().addComponents(maxIpsInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // G. Review Suspended Licenses
  if (subcommand === 'review') {
    try {
      const { licenses } = await listLicenses({ status: 'suspended', page: 1, limit: 10 });
      if (licenses.length === 0) {
        const embed = createSuccessEmbed(
          'Review Dashboard',
          'There are no suspended licenses requiring review at this time.',
        );
        return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const embed = createWarningEmbed(
        'Suspended Licenses Review',
        `Found **${licenses.length}** suspended licenses requiring audit. Select one to review.`,
      );

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('review_select_license')
        .setPlaceholder('Select a license to review...')
        .addOptions(
          licenses.map((lic) => {
            const maskedKey = lic.key.substring(lic.key.length - 8);
            const name = lic.pluginId?.name || 'Unknown Plugin';
            return {
              label: `${name} (..${maskedKey})`,
              description: `Owner: ${lic.ownerTag} | IPs: ${lic.allowedIps.length}`,
              value: lic.key,
            };
          }),
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      const errEmbed = createErrorEmbed('Query Failed', 'Unable to retrieve suspended licenses.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // H. Update License
  if (subcommand === 'update') {
    const key = interaction.options.getString('key').trim();
    const maxIps = interaction.options.getInteger('max-ips');

    try {
      const license = await getLicenseByKey(key);
      if (!license) {
        const errEmbed = createErrorEmbed('Not Found', 'The requested license key does not exist.');
        return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      await updateLicenseMaxIps(key, maxIps, interaction.user.id);

      const limitDisplay = maxIps === -1 ? 'Unlimited' : maxIps.toString();
      const embed = createSuccessEmbed(
        'License Updated',
        `License key ${bold(maskKey(key))} has been successfully updated.\n\nNew IP whitelisting limit: ${bold(limitDisplay)}`,
      );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      const errEmbed = createErrorEmbed('Update Failed', err.message);
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }
}
