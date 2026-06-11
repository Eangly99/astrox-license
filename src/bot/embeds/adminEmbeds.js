import { EmbedBuilder, bold, inlineCode, userMention } from 'discord.js';
import { Colors } from '../../utils/colors.js';
import { formatDate } from '../../utils/formatters.js';

/**
 * Generate dashboard statistics embed.
 */
export function createStatsEmbed(stats) {
  const typesLines =
    Object.entries(stats.types)
      .map(([type, count]) => `• ${bold(type.toUpperCase())}: ${count}`)
      .join('\n') || 'No license data';

  const pluginsLines =
    stats.plugins.map((p) => `• ${bold(p.name)} (${p.slug}): ${p.count}`).join('\n') ||
    'No plugin data';

  return new EmbedBuilder()
    .setTitle('AstroX License — Administrator Dashboard')
    .setColor(Colors.PRIMARY)
    .addFields(
      { name: 'Total Licenses', value: stats.total.toString(), inline: true },
      { name: 'Active Licenses', value: stats.active.toString(), inline: true },
      { name: 'Suspended Licenses', value: stats.suspended.toString(), inline: true },
      { name: 'Revoked Licenses', value: stats.revoked.toString(), inline: true },
      { name: 'Expired Licenses', value: stats.expired.toString(), inline: true },
      { name: '\u200B', value: '\u200B', inline: true }, // Spacer
      { name: 'By Type', value: typesLines, inline: false },
      { name: 'By Plugin', value: pluginsLines, inline: false },
    )
    .setFooter({ text: '• AstroX License' })
    .setTimestamp();
}

/**
 * Generate paginated audit log.
 */
export function createAuditEmbed(logs, page, totalPages) {
  const embed = new EmbedBuilder()
    .setTitle('System Audit Log')
    .setColor(Colors.NEUTRAL)
    .setFooter({ text: `Page ${page}/${totalPages} • AstroX License` })
    .setTimestamp();

  if (logs.length === 0) {
    embed.setDescription('No audit logs found.');
    return embed;
  }

  const lines = logs.map((log, index) => {
    const num = index + 1 + (page - 1) * 10;
    const actor = userMention(log.actorId);
    const action = bold(log.action.toUpperCase());
    const key = log.targetKey ? inlineCode(log.targetKey) : 'N/A';
    const time = formatDate(log.timestamp);

    return `${bold(num.toString())}. [${time}] ${actor} executed ${action} on key ${key}`;
  });

  embed.setDescription(lines.join('\n'));
  return embed;
}

/**
 * Generate blacklist directory.
 */
export function createBlacklistEmbed(entries) {
  const embed = new EmbedBuilder()
    .setTitle('Global Blacklist Registry')
    .setColor(Colors.DANGER)
    .setFooter({ text: '• AstroX License' })
    .setTimestamp();

  if (entries.length === 0) {
    embed.setDescription('No items currently registered on the global blacklist.');
    return embed;
  }

  const lines = entries.map((entry, index) => {
    const num = index + 1;
    const val = inlineCode(entry.value.length > 24 ? `${entry.value.slice(0, 24)}…` : entry.value);
    const type = bold(entry.type.toUpperCase());
    const reason = entry.reason;
    const banner = userMention(entry.addedBy);

    return `${bold(num.toString())}. [${type}] ${val} | Reason: ${reason} (by ${banner})`;
  });

  embed.setDescription(lines.join('\n'));
  return embed;
}
