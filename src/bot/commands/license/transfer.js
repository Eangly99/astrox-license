import { SlashCommandBuilder, bold, userMention } from 'discord.js';
import { transferLicense } from '../../../services/licenseService.js';
import { createSuccessEmbed, createErrorEmbed } from '../../embeds/commonEmbeds.js';
import { transferLicenseSchema } from '../../../utils/validators.js';
import { maskKey } from '../../../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('transfer')
  .setDescription('Transfer license ownership to another user')
  .addStringOption((option) =>
    option.setName('key').setDescription('The license key to transfer').setRequired(true),
  )
  .addUserOption((option) =>
    option.setName('new-owner').setDescription('The new owner of the license').setRequired(true),
  );

/**
 * Execute command.
 */
export async function execute(interaction) {
  const key = interaction.options.getString('key').trim();
  const newOwner = interaction.options.getUser('new-owner');

  // Validate inputs
  const validation = transferLicenseSchema.safeParse({ key, newOwnerId: newOwner.id });
  if (!validation.success) {
    const errEmbed = createErrorEmbed('Validation Failed', 'Inputs provided are malformed.');
    return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }

  try {
    const license = await transferLicense(key, newOwner.id, newOwner.tag, interaction.user.id);
    const embed = createSuccessEmbed(
      'License Transferred',
      `License key ${bold(maskKey(license.key))} has been successfully transferred to ${userMention(newOwner.id)}.\n\nAll existing IP whitelists and Hardware bindings have been reset.`,
    );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    const errEmbed = createErrorEmbed('Transfer Failed', err.message);
    await interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
