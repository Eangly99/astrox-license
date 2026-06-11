import { Events } from 'discord.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ready-event');

export const name = Events.ClientReady;
export const once = true;

/**
 * Handle ready state.
 * @param {import('discord.js').Client} client
 */
export function execute(client) {
  log.info(
    {
      tag: client.user.tag,
      guilds: client.guilds.cache.size,
      ping: client.ws.ping,
    },
    'Bot connection established',
  );

  // Critical for Pterodactyl startup detection string (.pterodactyl.yml: done: "Bot is online")
  process.stdout.write('Bot is online\n');
}
