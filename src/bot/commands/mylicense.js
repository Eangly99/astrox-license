import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';
import License from '../../db/models/License.js';
import { createLicenseEmbed } from '../embeds/licenseEmbeds.js';
import { createErrorEmbed, createInfoEmbed } from '../embeds/commonEmbeds.js';

export const data = new SlashCommandBuilder()
  .setName('mylicense')
  .setDescription('View your plugin licenses and manage whitelisted IP addresses');

export async function execute(interaction) {
  try {
    const licenses = await License.find({
      ownerId: interaction.user.id,
      status: { $in: ['active', 'suspended'] },
    })
      .populate('pluginId')
      .sort({ createdAt: -1 });

    if (!licenses || licenses.length === 0) {
      const errEmbed = createErrorEmbed(
        'No Licenses Found',
        "We couldn't find any active or suspended licenses associated with your Discord account.",
      );
      return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    if (licenses.length === 1) {
      const license = licenses[0];
      const embed = createLicenseEmbed(license);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`my_manage_ips:${license.key}`)
          .setLabel('⚙️ Manage Whitelisted IPs')
          .setStyle(ButtonStyle.Primary),
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
        licenses.map((lic) => {
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
