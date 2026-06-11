import { Events, REST, Routes } from 'discord.js';
import { config } from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ready-event');

export const name = Events.ClientReady;
export const once = true;

/**
 * Handle ready state and automatically deploy commands.
 * @param {import('discord.js').Client} client
 */
export async function execute(client) {
  log.info(
    {
      tag: client.user.tag,
      guilds: client.guilds.cache.size,
      ping: client.ws.ping,
    },
    'Bot connection established',
  );

  try {
    log.info('Syncing slash commands with Discord Gateway...');
    const commands = client.commands.map((cmd) => cmd.data.toJSON());
    const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);

    // Deploy instantly to target Guild ID
    await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), {
      body: commands,
    });

    log.info({ count: commands.length }, 'Application commands successfully registered');
  } catch (error) {
    log.error({ err: error }, 'Failed to auto-register application commands on boot');
  }

  // Critical for Pterodactyl startup detection string
  process.stdout.write('Bot is online\n');
}
