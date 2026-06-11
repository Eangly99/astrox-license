import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getLicenseByKey } from '../../../services/licenseService.js';
import { createLicenseEmbed } from '../../embeds/licenseEmbeds.js';
import { createErrorEmbed } from '../../embeds/commonEmbeds.js';

export const data = new SlashCommandBuilder()
  .setName('verify')
  .setDescription('Verify the status and configuration of a license key')
  .addStringOption((option) =>
    option.setName('key').setDescription('The license key to verify').setRequired(true),
  );

/**
 * Execute command.
 */
export async function execute(interaction) {
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

    // Attach Status Check button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`check_status:${license.key}`)
        .setLabel('🔍 Check Status')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } catch (err) {
    const errEmbed = createErrorEmbed('Failed', 'An error occurred during query execution.');
    await interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
