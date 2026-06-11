import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createLogger } from '../../utils/logger.js';
import { createSuccessEmbed, createErrorEmbed } from '../embeds/commonEmbeds.js';
import { getLicenseByKey } from '../../services/licenseService.js';
import { createLicenseEmbed } from '../embeds/licenseEmbeds.js';

const log = createLogger('plugin-select');

/**
 * Handle StringSelectMenu interactions.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
export async function handleSelect(interaction) {
  const customId = interaction.customId;
  const values = interaction.values;

  log.debug({ customId, values }, 'Select menu interaction received');

  if (customId === 'my_select_license') {
    const key = values[0];
    try {
      const license = await getLicenseByKey(key);
      if (!license) {
        const errorEmbed = createErrorEmbed('Not Found', 'The selected license no longer exists.');
        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

      if (license.ownerId !== interaction.user.id) {
        const errorEmbed = createErrorEmbed(
          'Access Denied',
          'You do not have permission to view this license.',
        );
        return await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }

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

      // If already deferred or replied, update it, otherwise reply
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          embeds: [embed],
          components: [row],
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.update({ embeds: [embed], components: [row] });
      }
    } catch (err) {
      log.error({ err }, 'Error handling my_select_license selection');
      const errorEmbed = createErrorEmbed('Error', 'Unable to retrieve license details.');
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (customId.startsWith('plugin_select:')) {
    const embed = createSuccessEmbed(
      'Plugins Selected',
      `You selected the following items:\n${values.map((v) => `• \`${v}\``).join('\n')}`,
    );
    return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  log.warn({ customId }, 'Unrouted select menu interaction');
}
