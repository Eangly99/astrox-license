import { Events, Collection, MessageFlags } from 'discord.js';
import { config } from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';
import { createErrorEmbed } from '../embeds/commonEmbeds.js';
import { handleButton } from '../components/licenseButtons.js';
import { handleSelect } from '../components/pluginSelect.js';
import { handleModal } from '../components/licenseModal.js';

const log = createLogger('interaction-event');

export const name = Events.InteractionCreate;

/**
 * Check if the user has admin authority.
 * @param {import('discord.js').Interaction} interaction
 * @returns {boolean}
 */
function isAdmin(interaction) {
  if (!interaction.guild) return false;
  const member = interaction.member;
  if (!member) return false;

  // 1. Administrator permission flag check
  if (member.permissions.has('Administrator')) return true;

  // 2. Role assignment check
  if (config.ADMIN_ROLE_ID && member.roles.cache.has(config.ADMIN_ROLE_ID)) return true;

  return false;
}

/**
 * Handle interaction events.
 * @param {import('discord.js').Interaction} interaction
 */
export async function execute(interaction) {
  try {
    // 1. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        log.warn({ commandName: interaction.commandName }, 'Command registration mismatch');
        return;
      }

      // Check admin restriction
      if (command.adminOnly && !isAdmin(interaction)) {
        log.warn(
          { commandName: interaction.commandName, userId: interaction.user.id },
          'Blocked unauthorized command execution',
        );
        const embed = createErrorEmbed(
          'Access Denied',
          'You do not have the required permissions or administrator role to execute this command.',
        );
        return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      // Cooldown implementation
      const { cooldowns } = interaction.client;
      if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Collection());
      }

      const now = Date.now();
      const timestamps = cooldowns.get(command.data.name);
      const cooldownAmount = (command.cooldown || 3) * 1000;

      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        if (now < expirationTime) {
          const expiredTimestamp = Math.round(expirationTime / 1000);
          return await interaction.reply({
            content: `Rate limit hit. You can use this command again <t:${expiredTimestamp}:R>.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

      log.debug(
        { commandName: interaction.commandName, user: interaction.user.username },
        'Executing command',
      );
      await command.execute(interaction);
      return;
    }

    // 2. Handle Autocomplete Handlers
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command && typeof command.autocomplete === 'function') {
        await command.autocomplete(interaction);
      }
      return;
    }

    // 3. Handle Buttons
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    // 4. Handle Select Menus
    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }

    // 5. Handle Modal Submissions
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }
  } catch (error) {
    log.error(
      { err: error, interactionId: interaction.id },
      'Unhandled interaction execution error',
    );

    const errorEmbed = createErrorEmbed(
      'Execution Error',
      'An unexpected error occurred while processing this action.',
    );

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
      }
    } catch (sendError) {
      log.error({ err: sendError }, 'Failed to transmit error message fallback');
    }
  }
}
