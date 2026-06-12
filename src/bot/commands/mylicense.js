import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';
import License from '../../db/models/License.js';
import AuditLog from '../../db/models/AuditLog.js';
import { cacheService } from '../../services/cacheService.js';
import { LICENSE_STATUS, AUDIT_ACTIONS } from '../../utils/constants.js';
import { createLicenseEmbed } from '../embeds/licenseEmbeds.js';
import { createErrorEmbed, createInfoEmbed } from '../embeds/commonEmbeds.js';
import { maskKey } from '../../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('mylicense')
  .setDescription('View your plugin licenses and manage whitelisted IP addresses');

export async function execute(interaction) {
  try {
    const now = new Date();
    // 1. Bulk update expired licenses for this user
    const expiredLicenses = await License.find({
      ownerId: interaction.user.id,
      expiresAt: { $lt: now },
      status: { $nin: [LICENSE_STATUS.EXPIRED, LICENSE_STATUS.REVOKED] },
    });

    if (expiredLicenses.length > 0) {
      const expiredKeys = expiredLicenses.map((l) => l.key);
      await License.updateMany(
        { key: { $in: expiredKeys } },
        { $set: { status: LICENSE_STATUS.EXPIRED } }
      );

      const auditLogsToCreate = expiredLicenses.map((license) => ({
        action: AUDIT_ACTIONS.EXPIRE,
        actorId: 'system',
        targetKey: license.key ? maskKey(license.key) : null,
        details: { reason: 'License expired' },
      }));

      if (auditLogsToCreate.length > 0) {
        await AuditLog.insertMany(auditLogsToCreate);
      }

      for (const license of expiredLicenses) {
        if (license.activeCacheKeys && license.activeCacheKeys.length > 0) {
          for (const keyToDel of license.activeCacheKeys) {
            await cacheService.delete(keyToDel);
          }
        }
      }
      await cacheService.delete('stats:dashboard');
    }

    // 2. Fetch active and suspended licenses
    const activeLicenses = await License.find({
      ownerId: interaction.user.id,
      status: { $in: [LICENSE_STATUS.ACTIVE, LICENSE_STATUS.SUSPENDED] },
    })
      .populate('pluginId')
      .sort({ createdAt: -1 });

    if (!activeLicenses || activeLicenses.length === 0) {
      const errEmbed = createErrorEmbed(
        'No Licenses Found',
        "We couldn't find any active or suspended licenses associated with your Discord account.",
      );
      return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    if (activeLicenses.length === 1) {
      const license = activeLicenses[0];
      const embed = createLicenseEmbed(license);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`my_manage_ips:${license.key}`)
          .setLabel('⚙️ Manage Whitelisted IPs')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`my_copy_key:${license.key}`)
          .setLabel('📋 Copy License Key')
          .setStyle(ButtonStyle.Secondary),
      );

      return await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Multiple licenses: Present a high-quality selection menu
    const embed = createInfoEmbed(
      'Your Plugin Licenses',
      'You hold multiple licenses in our registry. Select one from the dropdown menu below to view details and manage whitelisted IP addresses.',
    );

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('my_select_license')
      .setPlaceholder('Select a plugin license...')
      .addOptions(
        activeLicenses.map((lic) => {
          const maskedKey = lic.key.substring(lic.key.length - 8);
          const name = lic.pluginId?.name || 'Unknown Plugin';
          return {
            label: name,
            description: `Type: ${lic.type.toUpperCase()} | Status: ${lic.status.toUpperCase()} | (..${maskedKey})`,
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
    const errEmbed = createErrorEmbed(
      'Query Failed',
      'Unable to retrieve your license list at this time.',
    );
    await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
  }
}
