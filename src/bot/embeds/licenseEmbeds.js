import { EmbedBuilder, blockQuote, inlineCode, bold, codeBlock, userMention } from 'discord.js';
import { STATUS_COLORS, Colors } from '../../utils/colors.js';
import {
  maskKey,
  formatDate,
  formatRelative,
  statusBadge,
  formatIpList,
} from '../../utils/formatters.js';

/**
 * Generate full license detail embed.
 */
export function createLicenseEmbed(license) {
  const color = STATUS_COLORS[license.status] || Colors.PRIMARY;
  const hwidVal = license.hwid ? inlineCode(maskKey(license.hwid)) : 'Not bound';

  const embed = new EmbedBuilder()
    .setTitle('License Details')
    .setColor(color)
    .addFields(
      { name: 'License Key', value: blockQuote(inlineCode(maskKey(license.key))), inline: false },
      { name: 'Plugin', value: license.pluginId.name || 'Unknown Plugin', inline: true },
      { name: 'Owner', value: userMention(license.ownerId), inline: true },
      { name: 'Type', value: license.type.toUpperCase(), inline: true },
      { name: 'Status', value: statusBadge(license.status), inline: true },
      { name: 'Max IPs', value: license.maxIps.toString(), inline: true },
      {
        name: 'Allowed IPs',
        value: formatIpList(license.allowedIps, license.maxIps),
        inline: true,
      },
      { name: 'Hardware Fingerprint (HWID)', value: hwidVal, inline: false },
      {
        name: 'Expires At',
        value: license.expiresAt ? formatDate(license.expiresAt) : 'Lifetime',
        inline: true,
      },
      { name: 'Created At', value: formatDate(license.createdAt), inline: true },
      { name: 'Last Validated', value: formatRelative(license.lastValidatedAt), inline: true },
    )
    .setFooter({ text: '• AstroX License' })
    .setTimestamp();

  return embed;
}

/**
 * Generate paginated license list.
 */
export function createLicenseListEmbed(licenses, page, totalPages) {
  const embed = new EmbedBuilder()
    .setTitle('License List')
    .setColor(Colors.PRIMARY)
    .setFooter({ text: `Page ${page}/${totalPages} • AstroX License` })
    .setTimestamp();

  if (licenses.length === 0) {
    embed.setDescription('No licenses found matching the criteria.');
    return embed;
  }

  const lines = licenses.map((lic, index) => {
    const num = index + 1 + (page - 1) * 10;
    const keyStr = inlineCode(maskKey(lic.key));
    const badge = statusBadge(lic.status);
    const plugName = lic.pluginId?.name || 'Unknown Plugin';
    return `${bold(num.toString())}. ${keyStr} | ${badge} | ${bold(plugName)} (${userMention(lic.ownerId)})`;
  });

  embed.setDescription(lines.join('\n'));
  return embed;
}

/**
 * Generate the new license created embed (safe to show raw key).
 */
export function createLicenseCreatedEmbed(license, rawKey) {
  return new EmbedBuilder()
    .setTitle('License Generated Successfully')
    .setColor(Colors.SUCCESS)
    .setDescription(
      `Here is your newly generated license key. ${bold('Store this securely')}, it will not be displayed in plaintext again.\n\n${codeBlock(rawKey)}`,
    )
    .addFields(
      { name: 'Plugin Name', value: license.pluginId.name || 'Unknown Plugin', inline: true },
      { name: 'Owner', value: userMention(license.ownerId), inline: true },
      { name: 'License Type', value: license.type.toUpperCase(), inline: true },
      {
        name: 'Expires At',
        value: license.expiresAt ? formatDate(license.expiresAt) : 'Lifetime',
        inline: true,
      },
      { name: 'Max IPs Allowed', value: license.maxIps.toString(), inline: true },
    )
    .setFooter({ text: '• AstroX License' })
    .setTimestamp();
}

/**
 * Create verification handshake result preview.
 */
export function createVerifyEmbed(result) {
  const isOk = result.valid;
  const embed = new EmbedBuilder()
    .setTitle(isOk ? 'License Verification Successful' : 'License Verification Failed')
    .setColor(isOk ? Colors.SUCCESS : Colors.DANGER)
    .setTimestamp()
    .setFooter({ text: '• AstroX License' });

  if (isOk) {
    embed.setDescription('The client plugin verified successfully and received a valid token.');
    if (result.token) {
      embed.addFields({
        name: 'Verification Token (JWT)',
        value: codeBlock(maskKey(result.token)),
        inline: false,
      });
    }
  } else {
    embed.setDescription(
      `Handshake failed:\n${blockQuote(result.reason || 'Verification check rejected.')}`,
    );
  }

  return embed;
}
