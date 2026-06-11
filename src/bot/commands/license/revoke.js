import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  bold,
} from 'discord.js';
import { getLicenseByKey } from '../../../services/licenseService.js';
import { pendingRevocations } from '../../components/licenseButtons.js';
import { createErrorEmbed, createWarningEmbed } from '../../embeds/commonEmbeds.js';
import { maskKey } from '../../../utils/formatters.js';

export const data = new SlashCommandBuilder()
  .setName('revoke')
  .setDescription('Revoke an active license key')
  .addStringOption((option) =>
    option.setName('key').setDescription('The license key to revoke').setRequired(true),
  )
  .addStringOption((option) =>
    option.setName('reason').setDescription('Optional reason for revocation').setRequired(false),
  );

// Revocations are destructive admin operations
export const adminOnly = true;

/**
 * Execute command.
 */
export async function execute(interaction) {
  const key = interaction.options.getString('key').trim();
  const reason = interaction.options.getString('reason') || 'No reason provided';

  try {
    const license = await getLicenseByKey(key);
    if (!license) {
      const errEmbed = createErrorEmbed('Not Found', 'The requested license key does not exist.');
      return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    if (license.status === 'revoked') {
      const errEmbed = createErrorEmbed(
        'Already Revoked',
        'This license has already been revoked.',
      );
      return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    // Set pending record
    pendingRevocations.set(interaction.user.id, { key, reason });

    const confirmEmbed = createWarningEmbed(
      'Confirm Revocation',
      `Are you sure you want to revoke license ${bold(maskKey(key))}?\nThis action is destructive and cannot be undone.`,
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

    await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
  } catch (err) {
    const errEmbed = createErrorEmbed('Failed', 'Failed to initialize revocation process.');
    await interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
