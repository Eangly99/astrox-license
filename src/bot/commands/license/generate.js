import { SlashCommandBuilder } from 'discord.js';
import Plugin from '../../../db/models/Plugin.js';
import { createLicense } from '../../../services/licenseService.js';
import { createLicenseCreatedEmbed } from '../../embeds/licenseEmbeds.js';
import { createErrorEmbed } from '../../embeds/commonEmbeds.js';
import { DURATION_PRESETS } from '../../../utils/constants.js';
import { generateLicenseSchema } from '../../../utils/validators.js';

export const data = new SlashCommandBuilder()
  .setName('generate')
  .setDescription('Generate a new Minecraft plugin license key')
  .addStringOption((option) =>
    option
      .setName('plugin')
      .setDescription('The plugin to link this license to')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addUserOption((option) =>
    option.setName('user').setDescription('The Discord user to own this license').setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('The license billing structure')
      .setRequired(true)
      .addChoices(
        { name: 'Lifetime', value: 'lifetime' },
        { name: 'Subscription', value: 'subscription' },
        { name: 'Trial', value: 'trial' },
      ),
  )
  .addStringOption((option) =>
    option
      .setName('duration')
      .setDescription('Duration (e.g. 1d, 7d, 30d, 90d, 365d) — ignored for lifetime')
      .setRequired(false),
  )
  .addIntegerOption((option) =>
    option
      .setName('max-ips')
      .setDescription('Maximum concurrent whitelisted IPs allowed (default: 1)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(50),
  );

/**
 * Handle autocomplete.
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
  } catch (err) {
    // Autocomplete errors must fail silently
    await interaction.respond([]);
  }
}

/**
 * Execute command.
 */
export async function execute(interaction) {
  const pluginId = interaction.options.getString('plugin');
  const user = interaction.options.getUser('user');
  const type = interaction.options.getString('type');
  const rawDuration = interaction.options.getString('duration');
  const maxIps = interaction.options.getInteger('max-ips') || 1;

  // 1. Zod input validation
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

  // 2. Parse duration
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

    // Re-query to populate plugin details for the embed
    const populated = await Plugin.findById(pluginId).lean();
    license.pluginId = populated;

    const embed = createLicenseCreatedEmbed(license, license.key);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    const errEmbed = createErrorEmbed('License Creation Failed', err.message);
    await interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
