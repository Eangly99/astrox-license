import { EmbedBuilder } from 'discord.js';
import { Colors } from '../../utils/colors.js';

/**
 * Helper to build common base embed structure.
 * @param {string} title
 * @param {string} description
 * @param {number} color
 * @returns {EmbedBuilder}
 */
function createBaseEmbed(title, description, color) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setFooter({ text: '• AstroX License' })
    .setTimestamp();
}

export function createSuccessEmbed(title, description) {
  return createBaseEmbed(title, description, Colors.SUCCESS);
}

export function createErrorEmbed(title, description) {
  return createBaseEmbed(title, description, Colors.DANGER);
}

export function createWarningEmbed(title, description) {
  return createBaseEmbed(title, description, Colors.WARNING);
}

export function createInfoEmbed(title, description) {
  return createBaseEmbed(title, description, Colors.PRIMARY);
}
