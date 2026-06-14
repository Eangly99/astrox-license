import { EmbedBuilder } from 'discord.js';
import { client } from '../bot/client.js';
import { config } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { maskKey, maskIpAddress } from '../utils/formatters.js';

const log = createLogger('notification-service');

/**
 * Send a license validation handshake notification to the configured Discord channel.
 * @param {object} params
 * @param {string} params.licenseKey
 * @param {string} params.pluginId
 * @param {string} params.serverIp
 * @param {string} params.hwid
 * @param {object} result The validation outcome object
 */
export async function logValidationToDiscord({ licenseKey, pluginId, serverIp, hwid }, result) {
  const channelId = config.LOG_CHANNEL_ID;
  if (!channelId) return;

  if (!client || !client.isReady()) {
    log.warn('Discord client is not ready. Skipping Discord channel notification.');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      log.error({ channelId }, 'Configured LOG_CHANNEL_ID is not a valid text channel');
      return;
    }

    const maskedKey = maskKey(licenseKey);
    const maskedIp = maskIpAddress(serverIp);

    const embed = new EmbedBuilder();

    if (result.valid) {
      embed
        .setTitle('🟢 License Validated')
        .setColor('#2ecc71')
        .setDescription(`A license key has been successfully validated.`)
        .addFields(
          { name: 'Plugin', value: `\`${pluginId}\``, inline: true },
          { name: 'License Key', value: `\`${maskedKey}\``, inline: true },
          { name: 'IP Address', value: `\`${maskedIp}\``, inline: true },
          {
            name: 'Owner',
            value: `<@${result.discord.ownerId}> (${result.discord.ownerTag})`,
            inline: true,
          },
          {
            name: 'HWID Hash',
            value: `\`${hwid ? `${hwid.slice(0, 16)}...` : 'N/A'}\``,
            inline: true,
          },
        );
    } else {
      embed
        .setTitle('🔴 License Validation Failed')
        .setColor('#e74c3c')
        .setDescription(`An invalid or blocked license validation attempt occurred.`)
        .addFields(
          { name: 'Plugin', value: `\`${pluginId}\``, inline: true },
          { name: 'License Key', value: `\`${maskedKey}\``, inline: true },
          { name: 'IP Address', value: `\`${maskedIp}\``, inline: true },
          { name: 'Failure Reason', value: result.reason || 'Unknown failure', inline: false },
        );
    }

    embed.setTimestamp();

    await channel.send({ embeds: [embed] });
    log.debug({ key: maskedKey, valid: result.valid }, 'Validation log posted to Discord channel');
  } catch (err) {
    log.error({ err }, 'Failed to post validation log to Discord channel');
  }
}
