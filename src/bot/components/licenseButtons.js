import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  revokeLicense,
  getLicenseByKey,
  listLicenses,
  reactivateLicense,
} from '../../services/licenseService.js';
import { createLogger } from '../../utils/logger.js';
import {
  createSuccessEmbed,
  createErrorEmbed,
  createWarningEmbed,
} from '../embeds/commonEmbeds.js';
import { createLicenseEmbed, createLicenseListEmbed } from '../embeds/licenseEmbeds.js';
import AuditLog from '../../db/models/AuditLog.js';
import { createAuditEmbed } from '../embeds/adminEmbeds.js';
import { maskKey } from '../../utils/formatters.js';

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
    if (!pending || Date.now() > pending.expiresAt) {
      if (pending && pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      pendingRevocations.delete(interaction.user.id);
      const errorEmbed = createErrorEmbed(
        'Action Expired',
        'The pending revocation action could not be found or has expired (5 minute limit).',
      );
      return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }

    try {
      await revokeLicense(pending.key, interaction.user.id, pending.reason);
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
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
    const pending = pendingRevocations.get(interaction.user.id);
    if (pending && pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
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

  // 3c. Copy License Key button click
  if (customId.startsWith('my_copy_key:')) {
    const key = customId.substring('my_copy_key:'.length);
    log.debug({ key: key.substring(key.length - 8) }, 'User requested license key plaintext copy');

    try {
      const license = await getLicenseByKey(key);
      if (!license) {
        const errorEmbed = createErrorEmbed('Not Found', 'This license key no longer exists.');
        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      if (license.ownerId !== interaction.user.id) {
        const errorEmbed = createErrorEmbed(
          'Access Denied',
          'You do not have permission to copy this license.',
        );
        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      const copyEmbed = createSuccessEmbed(
        'License Key Retrieved',
        `Below is your plaintext license key. Click inside the code block to select and copy it.\n\n\`\`\`\n${key}\n\`\`\`\n\n> [!WARNING]\n> **Keep this key private!** Sharing this key can result in automatic suspension of your license.`,
      );

      await interaction.reply({ embeds: [copyEmbed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      log.error({ err }, 'Failed to retrieve license key copy');
      const errorEmbed = createErrorEmbed('Error', 'Unable to retrieve license key at this time.');
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // 3b. Manage IPs button click for /mylicense
  if (customId.startsWith('my_manage_ips:')) {
    const key = customId.substring('my_manage_ips:'.length);
    log.debug({ key: key.substring(key.length - 8) }, 'User requested IP management modal');

    try {
      const license = await getLicenseByKey(key);
      if (!license) {
        const errorEmbed = createErrorEmbed('Not Found', 'This license key no longer exists.');
        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      if (license.ownerId !== interaction.user.id) {
        const errorEmbed = createErrorEmbed(
          'Access Denied',
          'You do not have permission to manage this license.',
        );
        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      const modal = new ModalBuilder()
        .setCustomId(`my_ips_modal:${key}`)
        .setTitle('Manage Whitelisted IPs');

      const ipInput = new TextInputBuilder()
        .setCustomId('allowed_ips_input')
        .setLabel(`IPs (one per line, max: ${license.maxIps})`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('e.g.\n192.168.1.1\n10.0.0.5')
        .setValue(license.allowedIps.join('\n'))
        .setRequired(false);

      const actionRow = new ActionRowBuilder().addComponents(ipInput);
      modal.addComponents(actionRow);

      await interaction.showModal(modal);
    } catch (err) {
      log.error({ err }, 'Failed to construct/show IP management modal');
      const errorEmbed = createErrorEmbed('Error', 'Unable to process your request at this time.');
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // 4. Paginate License List (list|ownerId|pluginId|status|page)
  if (customId.startsWith('list|')) {
    const [_, rawOwnerId, rawPluginId, rawStatus, pageStr] = customId.split('|');
    const ownerId = (rawOwnerId === 'null' || !rawOwnerId) ? null : rawOwnerId;
    const pluginId = (rawPluginId === 'null' || !rawPluginId) ? null : rawPluginId;
    const status = (rawStatus === 'null' || !rawStatus) ? null : rawStatus;
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

      await interaction.update({ embeds: [embed], components: [row] });
    } catch (err) {
      log.error({ err }, 'Failed to fetch next license page');
    }
    return;
  }

  // 5. Paginate Audit Log (audit|actorId|action|page)
  if (customId.startsWith('audit|')) {
    const [_, rawActorId, rawAction, pageStr] = customId.split('|');
    const actorId = (rawActorId === 'null' || !rawActorId) ? null : rawActorId;
    const action = (rawAction === 'null' || !rawAction) ? null : rawAction;
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
          .setCustomId(`audit|${actorId || ''}|${action || ''}|${page - 1}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`audit|${actorId || ''}|${action || ''}|${page + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
      );

      await interaction.update({ embeds: [embed], components: [row] });
    } catch (err) {
      log.error({ err }, 'Failed to paginate audit log');
    }
    return;
  }

  // 6. Review Reactivate
  if (customId.startsWith('review_reactivate:')) {
    const key = customId.substring('review_reactivate:'.length);
    try {
      await reactivateLicense(key, interaction.user.id, 'Staff review reactivation');
      const embed = createSuccessEmbed(
        'License Reactivated',
        `Successfully reactivated license key \`${maskKey(key)}\`.`,
      );
      await interaction.update({ embeds: [embed], components: [] });
    } catch (err) {
      log.error({ err }, 'Failed to reactivate license from review button click');
      const errorEmbed = createErrorEmbed('Operation Failed', err.message);
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // 7. Review Revoke
  if (customId.startsWith('review_revoke:')) {
    const key = customId.substring('review_revoke:'.length);
    try {
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
        reason: 'Staff review revocation',
        expiresAt: Date.now() + 5 * 60 * 1000,
        timeoutId,
      });

      const confirmEmbed = createWarningEmbed(
        'Confirm Revocation',
        `Are you sure you want to revoke license \`${maskKey(key)}\`?\nThis action is destructive and cannot be undone.`,
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

      await interaction.update({
        embeds: [confirmEmbed],
        components: [row],
      });
    } catch (err) {
      log.error({ err }, 'Failed to initialize review revocation');
      const errorEmbed = createErrorEmbed('Error', 'Unable to initiate revocation.');
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
  }
}
