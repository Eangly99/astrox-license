import { createLogger } from '../../utils/logger.js';
import { createSuccessEmbed } from '../embeds/commonEmbeds.js';

const log = createLogger('plugin-select');

/**
 * Handle StringSelectMenu interactions.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction
 */
export async function handleSelect(interaction) {
  const customId = interaction.customId;
  const values = interaction.values;

  log.debug({ customId, values }, 'Select menu interaction received');

  if (customId.startsWith('plugin_select:')) {
    const embed = createSuccessEmbed(
      'Plugins Selected',
      `You selected the following items:\n${values.map((v) => `• \`${v}\``).join('\n')}`,
    );
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  log.warn({ customId }, 'Unrouted select menu interaction');
}
