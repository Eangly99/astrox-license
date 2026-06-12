import { inlineCode, MessageFlags } from 'discord.js';
import Plugin from '../../db/models/Plugin.js';
import { createLicense, updateLicenseIps, getLicenseByKey } from '../../services/licenseService.js';
import { createLogger } from '../../utils/logger.js';
import { createSuccessEmbed, createErrorEmbed } from '../embeds/commonEmbeds.js';
import { DURATION_PRESETS } from '../../utils/constants.js';
import { parseDuration } from '../../utils/formatters.js';

const log = createLogger('license-modal');

/**
 * Handle modal submit events.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleModal(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('my_ips_modal:')) {
    const key = customId.substring('my_ips_modal:'.length);
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (err) {
      log.warn({ err }, 'Failed to defer reply for IP update modal');
    }

    const rawIps = interaction.fields.getTextInputValue('allowed_ips_input');
    const ips = rawIps
      .split(/[\n,]/)
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0);

    try {
      await updateLicenseIps(key, interaction.user.id, ips, interaction.user.id);
      const license = await getLicenseByKey(key);

      const successEmbed = createSuccessEmbed(
        'IP Whitelist Updated',
        `Successfully updated whitelisted IP addresses for your plugin license.\n\n**Whitelisted IPs (${ips.length}/${license.maxIps}):**\n${
          ips.length > 0
            ? ips.map((ip) => `• \`${ip}\``).join('\n')
            : '*No IP addresses whitelisted. Auto-binding on next validation.*'
        }`,
      );

      return await interaction.editReply({ embeds: [successEmbed] });
    } catch (err) {
      log.error(
        { err, key: key.substring(key.length - 8) },
        'Failed to update IPs from modal submission',
      );
      const errEmbed = createErrorEmbed('IP Update Failed', err.message);
      return await interaction.editReply({ embeds: [errEmbed] });
    }
  }

  if (customId !== 'bulk_generate_modal') return;

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (err) {
    log.warn({ err }, 'Failed to defer reply for bulk generate modal');
  }

  const pluginSlug = interaction.fields.getTextInputValue('plugin_slug').trim().toLowerCase();
  const rawUserIds = interaction.fields.getTextInputValue('user_ids');
  const licenseType = interaction.fields.getTextInputValue('license_type').trim().toLowerCase();
  const rawDuration = interaction.fields.getTextInputValue('duration').trim();
  const rawMaxIps = interaction.fields.getTextInputValue('max_ips').trim();

  // 1. Resolve plugin
  const plugin = await Plugin.findOne({ slug: pluginSlug });
  if (!plugin) {
    const errEmbed = createErrorEmbed(
      'Plugin Not Found',
      `No registered plugin matches slug: ${inlineCode(pluginSlug)}`,
    );
    return await interaction.editReply({ embeds: [errEmbed] });
  }

  // 2. Parse users
  const userIds = rawUserIds
    .split('\n')
    .map((id) => id.trim())
    .filter((id) => /^\d{17,19}$/.test(id)); // Validate Snowflake format

  if (userIds.length === 0) {
    const errEmbed = createErrorEmbed(
      'Validation Failed',
      'No valid Discord User IDs (Snowflakes) were provided.',
    );
    return await interaction.editReply({ embeds: [errEmbed] });
  }

  // 3. Parse inputs
  const maxIps = parseInt(rawMaxIps, 10) || 1;
  let duration = null;

  if (licenseType !== 'lifetime') {
    const parsedMs = parseDuration(rawDuration);
    if (parsedMs) {
      duration = parsedMs.toString();
    } else {
      // Fallback to 30 days if invalid duration format given for trial/subscription
      duration = DURATION_PRESETS['30d'].toString();
    }
  }

  const successKeys = [];
  const errorsList = [];

  // 4. Batch generate licenses
  for (const userId of userIds) {
    try {
      // Lookup or assume user tag snap
      const ownerTag = `BulkUser#${userId.slice(-4)}`;
      const license = await createLicense(
        {
          pluginId: plugin._id.toString(),
          ownerId: userId,
          ownerTag,
          type: licenseType,
          duration,
          maxIps,
        },
        interaction.user.id,
      );
      successKeys.push(`• User <@${userId}>: ${inlineCode(license.key)}`);
    } catch (err) {
      log.error({ err, userId }, 'Failed to create license in bulk generation loop');
      errorsList.push(`• <@${userId}>: ${err.message}`);
    }
  }

  // 5. Reply
  const descParts = [];
  if (successKeys.length > 0) {
    descParts.push(`**Generated Keys (${successKeys.length}):**\n${successKeys.join('\n')}`);
  }
  if (errorsList.length > 0) {
    descParts.push(`**Errors (${errorsList.length}):**\n${errorsList.join('\n')}`);
  }

  const summaryEmbed = createSuccessEmbed('Bulk Licensing Complete', descParts.join('\n\n'));
  await interaction.editReply({ embeds: [summaryEmbed] });
}
