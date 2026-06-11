import { SlashCommandBuilder } from 'discord.js';
import { getStats } from '../../../services/licenseService.js';
import { createStatsEmbed } from '../../embeds/adminEmbeds.js';
import { createErrorEmbed } from '../../embeds/commonEmbeds.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View administrator dashboard and system metrics');

export const adminOnly = true;

/**
 * Execute command.
 */
export async function execute(interaction) {
  try {
    const stats = await getStats();
    const embed = createStatsEmbed(stats);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    const errEmbed = createErrorEmbed('Statistics Error', 'Failed to calculate system statistics.');
    await interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
