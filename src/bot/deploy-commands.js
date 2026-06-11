import { REST, Routes } from 'discord.js';
import { glob } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('deploy-commands');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function deploy() {
  log.info('Starting command deployment scan...');
  const commands = [];
  const commandsDir = join(__dirname, 'commands');
  const pattern = join(commandsDir, '**/*.js').replace(/\\/g, '/');

  try {
    for await (const file of glob(pattern)) {
      const fileUrl = pathToFileURL(file).href;
      const command = await import(fileUrl);

      if (command.data && typeof command.execute === 'function') {
        commands.push(command.data.toJSON());
        log.debug({ name: command.data.name }, 'Scanned command for deployment');
      }
    }

    log.info({ count: commands.length }, 'Deploying slash commands to Discord...');
    const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);

    // Deploy to target guild for instant testing
    const data = await rest.put(
      Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
      { body: commands },
    );

    log.info({ deployedCount: data.length }, 'Successfully deployed application commands');
  } catch (error) {
    log.error({ err: error }, 'Deployment of slash commands failed');
    process.exit(1);
  }
}

deploy();
