import { inlineCode } from 'discord.js';
import Plugin from '../../db/models/Plugin.js';
import { createLicense } from '../../services/licenseService.js';
import { createLogger } from '../../utils/logger.js';
import { createSuccessEmbed, createErrorEmbed } from '../embeds/commonEmbeds.js';
import { DURATION_PRESETS } from '../../utils/constants.js';

const log = createLogger('license-modal');

/**
 * Handle modal submit events.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
export async function handleModal(interaction) {
  if (interaction.customId !== 'bulk_generate_modal') return;

  await interaction.deferReply({ ephemeral: true });

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
    const preset = DURATION_PRESETS[rawDuration];
    if (preset) {
      duration = preset.toString();
    } else {
      const parsedMs = parseInt(rawDuration, 10);
      if (!isNaN(parsedMs) && parsedMs > 0) {
        duration = parsedMs.toString();
      } else {
        // Fallback to 30 days if invalid duration format given for trial/subscription
        duration = DURATION_PRESETS['30d'].toString();
      }
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
