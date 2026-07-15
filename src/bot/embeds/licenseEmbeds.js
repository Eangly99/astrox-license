import { EmbedBuilder, inlineCode, bold, codeBlock, userMention } from 'discord.js';
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
  const hwidVal = license.hwid ? inlineCode(maskKey(license.hwid)) : '*Not bound*';

  return new EmbedBuilder()
    .setTitle('🔑 License Specifications')
    .setColor(color)
    .setDescription(
      `### 🏷️ Product Key\n` +
      `> ${inlineCode(maskKey(license.key))}\n\n` +
      `### 📋 General Details\n` +
      `• **Plugin:** \`${license.pluginId?.name || 'Unknown Plugin'}\`\n` +
      `• **Owner:** ${userMention(license.ownerId)}\n` +
      `• **License Type:** \`${license.type.toUpperCase()}\`\n` +
      `• **Status:** ${statusBadge(license.status)}`
    )
    .addFields(
      { name: '📡 Max IPs Allowed', value: `\`${license.maxIps}\``, inline: true },
      { name: '🌐 Bound IPs', value: inlineCode(formatIpList(license.allowedIps, license.maxIps)), inline: true },
      { name: '💻 Hardware Lock (HWID)', value: hwidVal, inline: false },
      { name: '⏳ Expires At', value: license.expiresAt ? formatDate(license.expiresAt) : '`Lifetime`', inline: true },
      { name: '📅 Created At', value: formatDate(license.createdAt), inline: true },
      { name: '🔄 Last Validated', value: formatRelative(license.lastValidatedAt), inline: true },
    )
    .setFooter({ text: '• Cipher License' })
    .setTimestamp();
}

/**
 * Generate paginated license list.
 */
export function createLicenseListEmbed(licenses, page, totalPages) {
  const embed = new EmbedBuilder()
    .setTitle('📁 License Directory')
    .setColor(Colors.PRIMARY)
    .setFooter({ text: `Page ${page}/${totalPages} • Cipher License` })
    .setTimestamp();

  if (licenses.length === 0) {
    embed.setDescription('*No licenses currently match the registry queries.*');
    return embed;
  }

  const lines = licenses.map((lic, index) => {
    const keyStr = inlineCode(maskKey(lic.key));
    const badge = statusBadge(lic.status);
    const plugName = lic.pluginId?.name || 'Unknown Plugin';
    const owner = userMention(lic.ownerId);

    return `\`${index + 1 + (page - 1) * 10}.\` ${keyStr}\n└ **${plugName}**  •  ${badge}  •  Owner: ${owner}`;
  });

  embed.setDescription(lines.join('\n\n'));
  return embed;
}

/**
 * Generate the new license created embed (safe to show raw key).
 */
export function createLicenseCreatedEmbed(license, rawKey) {
  return new EmbedBuilder()
    .setTitle('✨ License Generated Successfully')
    .setColor(Colors.SUCCESS)
    .setDescription(
      `### 🔒 Secure Product Key\n` +
      `Here is your newly generated license key. Store this securely — it **will not** be displayed in plaintext again.\n` +
      `${codeBlock(rawKey)}\n` +
      `### 📋 License Specifications`
    )
    .addFields(
      { name: '🔌 Plugin Name', value: `\`${license.pluginId?.name || 'Unknown Plugin'}\``, inline: true },
      { name: '👤 Owner', value: userMention(license.ownerId), inline: true },
      { name: '🏷️ License Type', value: `\`${license.type.toUpperCase()}\``, inline: true },
      { name: '📡 Max IPs Allowed', value: `\`${license.maxIps.toString()}\``, inline: true },
      { name: '⏳ Expires At', value: license.expiresAt ? formatDate(license.expiresAt) : '`Lifetime`', inline: true },
    )
    .setFooter({ text: '• Cipher License' })
    .setTimestamp();
}
