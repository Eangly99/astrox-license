import { Events, REST, Routes, ActivityType, EmbedBuilder } from 'discord.js';
import { config } from '../../utils/config.js';
import { createLogger } from '../../utils/logger.js';
import License from '../../db/models/License.js';

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

  // Send startup notification to Discord log channel if configured
  try {
    if (config.LOG_CHANNEL_ID) {
      const channel = await client.channels.fetch(config.LOG_CHANNEL_ID);
      if (channel && channel.isTextBased()) {
        const startupEmbed = new EmbedBuilder()
          .setTitle('🤖 System Online')
          .setColor('#3498db')
          .setDescription('AstroX Licensing bot has established gateway connection successfully.')
          .addFields(
            { name: 'Bot Tag', value: `\`${client.user.tag}\``, inline: true },
            { name: 'Guilds Served', value: `\`${client.guilds.cache.size}\``, inline: true },
            { name: 'Gateway Ping', value: `\`${client.ws.ping}ms\``, inline: true },
          )
          .setTimestamp();
        await channel.send({ embeds: [startupEmbed] });
        log.info(
          { channelId: config.LOG_CHANNEL_ID },
          'Bot startup status sent to Discord log channel',
        );
      }
    }
  } catch (err) {
    log.error({ err }, 'Failed to send bot online status to Discord log channel');
  }

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

  // Set playing status presence activity dynamically
  const updatePresence = async () => {
    try {
      const totalLicenses = await License.countDocuments();
      client.user.setPresence({
        activities: [{ name: `Managing ${totalLicenses} Licenses`, type: ActivityType.Playing }],
        status: 'online',
      });
      log.debug({ totalLicenses }, 'Client presence activity updated');
    } catch (err) {
      log.error({ err }, 'Failed to update presence activity');
    }
  };

  // Run with a 5-second delay to allow gateway session stabilization
  setTimeout(updatePresence, 5000);

  // Refresh every 10 minutes
  setInterval(updatePresence, 10 * 60 * 1000);

  // Critical for Pterodactyl startup detection string
  process.stdout.write('Bot is online\n');
}
