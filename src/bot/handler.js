import { glob } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('bot-handler');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load all slash commands dynamically.
 * @param {import('discord.js').Client} client
 */
export async function loadCommands(client) {
  const commandsDir = join(__dirname, 'commands');
  // Normalize Windows paths for globbing
  const pattern = join(commandsDir, '**/*.js').replace(/\\/g, '/');

  log.info('Loading slash commands...');
  let count = 0;

  try {
    for await (const file of glob(pattern)) {
      const fileUrl = pathToFileURL(file).href;
      const command = await import(fileUrl);

      if (command.data && typeof command.execute === 'function') {
        client.commands.set(command.data.name, command);
        log.debug({ command: command.data.name }, 'Loaded command');
        count++;
      } else {
        log.warn({ file }, 'Command file missing required exports (data, execute)');
      }
    }
    log.info({ count }, 'Successfully loaded slash commands');
  } catch (error) {
    log.error({ err: error }, 'Failed to load commands');
    throw error;
  }
}

/**
 * Load all events dynamically.
 * @param {import('discord.js').Client} client
 */
export async function loadEvents(client) {
  const eventsDir = join(__dirname, 'events');
  const pattern = join(eventsDir, '*.js').replace(/\\/g, '/');

  log.info('Loading client events...');
  let count = 0;

  try {
    for await (const file of glob(pattern)) {
      const fileUrl = pathToFileURL(file).href;
      const event = await import(fileUrl);

      if (event.name && typeof event.execute === 'function') {
        if (event.once) {
          client.once(event.name, (...args) => event.execute(...args));
        } else {
          client.on(event.name, (...args) => event.execute(...args));
        }
        log.debug({ event: event.name }, 'Registered event');
        count++;
      } else {
        log.warn({ file }, 'Event file missing name or execute export');
      }
    }
    log.info({ count }, 'Successfully registered client events');
  } catch (error) {
    log.error({ err: error }, 'Failed to register events');
    throw error;
  }
}
