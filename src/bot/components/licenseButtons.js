import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { revokeLicense, getLicenseByKey, listLicenses } from '../../services/licenseService.js';
import { createLogger } from '../../utils/logger.js';
import { createSuccessEmbed, createErrorEmbed } from '../embeds/commonEmbeds.js';
import { createLicenseEmbed, createLicenseListEmbed } from '../embeds/licenseEmbeds.js';
import AuditLog from '../../db/models/AuditLog.js';
import { createAuditEmbed } from '../embeds/adminEmbeds.js';

const log = createLogger('license-buttons');

// Map to store pending revocations: actorId -> { key, reason }
export const pendingRevocations = new Map();

/**
 * Route button clicks.
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleButton(interaction) {
  const customId = interaction.customId;

  // 1. Confirm Revoke
  if (customId === 'confirm_revoke') {
    const pending = pendingRevocations.get(interaction.user.id);
    if (!pending) {
      const errorEmbed = createErrorEmbed(
        'Action Expired',
        'The pending revocation action could not be found or has expired.',
      );
      return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }

    try {
      await revokeLicense(pending.key, interaction.user.id, pending.reason);
      pendingRevocations.delete(interaction.user.id);

      const successEmbed = createSuccessEmbed(
        'License Revoked',
        `The license has been successfully revoked.\nReason: ${pending.reason}`,
      );
      await interaction.update({ embeds: [successEmbed], components: [] });
    } catch (err) {
      log.error({ err }, 'Failed to confirm revocation from button click');
      const errorEmbed = createErrorEmbed(
        'Operation Failed',
        'Could not complete the license revocation.',
      );
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // 2. Cancel Revoke
  if (customId === 'cancel_revoke') {
    pendingRevocations.delete(interaction.user.id);
    const cancelEmbed = createSuccessEmbed(
      'Action Cancelled',
      'License revocation has been cancelled.',
    );
    return await interaction.update({ embeds: [cancelEmbed], components: [] });
  }

  // 3. Check Status
  if (customId.startsWith('check_status:')) {
    const key = customId.split(':')[1];
    log.debug({ key }, 'Re-evaluating license status from button click');

    try {
      const license = await getLicenseByKey(key);
      if (!license) {
        const errorEmbed = createErrorEmbed('Not Found', 'This license key no longer exists.');
        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      const embed = createLicenseEmbed(license);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      log.error({ err }, 'Failed to query license status from button click');
      const errorEmbed = createErrorEmbed(
        'Error',
        'Unable to retrieve license details at this time.',
      );
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // 4. Paginate License List (list:ownerId:pluginId:status:page)
  if (customId.startsWith('list:')) {
    const [_, rawOwnerId, rawPluginId, rawStatus, pageStr] = customId.split(':');
    const ownerId = rawOwnerId || null;
    const pluginId = rawPluginId || null;
    const status = rawStatus || null;
    let page = parseInt(pageStr, 10) || 1;

    try {
      const { licenses, totalPages } = await listLicenses({
        ownerId,
        pluginId,
        status,
        page,
        limit: 10,
      });

      // Correct page bounds if changed
      page = Math.max(1, Math.min(page, totalPages));

      const embed = createLicenseListEmbed(licenses, page, totalPages);

      // Create updated buttons
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

      await interaction.update({ embeds: [embed], components: [row] });
    } catch (err) {
      log.error({ err }, 'Failed to fetch next license page');
    }
    return;
  }

  // 5. Paginate Audit Log (audit:actorId:action:page)
  if (customId.startsWith('audit:')) {
    const [_, rawActorId, rawAction, pageStr] = customId.split(':');
    const actorId = rawActorId || null;
    const action = rawAction || null;
    let page = parseInt(pageStr, 10) || 1;

    try {
      const query = {};
      if (actorId) query.actorId = actorId;
      if (action) query.action = action;

      const total = await AuditLog.countDocuments(query);
      const totalPages = Math.max(1, Math.ceil(total / 10));
      page = Math.max(1, Math.min(page, totalPages));
      const skip = (page - 1) * 10;

      const logs = await AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(10).lean();

      const embed = createAuditEmbed(logs, page, totalPages);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`audit:${actorId || ''}:${action || ''}:${page - 1}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`audit:${actorId || ''}:${action || ''}:${page + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
      );

      await interaction.update({ embeds: [embed], components: [row] });
    } catch (err) {
      log.error({ err }, 'Failed to paginate audit log');
    }
  }
}
