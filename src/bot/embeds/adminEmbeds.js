import { EmbedBuilder, bold, inlineCode, userMention } from 'discord.js';
import { Colors } from '../../utils/colors.js';
import { formatDate } from '../../utils/formatters.js';

/**
 * Generate dashboard statistics embed.
 */
export function createStatsEmbed(stats) {
  const total = stats.total.toString();
  const active = stats.active.toString();
  const suspended = stats.suspended.toString();
  const revoked = stats.revoked.toString();
  const expired = stats.expired.toString();

  const overviewLine = [
    `📈 **Total:** \`${total}\``,
    `✅ **Active:** \`${active}\``,
    `🔒 **Suspended:** \`${suspended}\``,
    `❌ **Revoked:** \`${revoked}\``,
    `⏳ **Expired:** \`${expired}\``
  ].join('  •  ');

  const typesLines =
    Object.entries(stats.types)
      .map(([type, count]) => `├ **${type.toUpperCase()}**: \`${count}\``)
      .join('\n') || '└ *No license data*';
  
  let typesFormatted = typesLines;
  if (typesLines.includes('├')) {
    const lastIndex = typesLines.lastIndexOf('├');
    typesFormatted = typesLines.substring(0, lastIndex) + '└' + typesLines.substring(lastIndex + 1);
  }

  const pluginsLines =
    stats.plugins.map((p) => `├ **${p.name}** (\`${p.slug}\`): \`${p.count}\``).join('\n') ||
    '└ *No plugin data*';

  let pluginsFormatted = pluginsLines;
  if (pluginsLines.includes('├')) {
    const lastIndex = pluginsLines.lastIndexOf('├');
    pluginsFormatted = pluginsLines.substring(0, lastIndex) + '└' + pluginsLines.substring(lastIndex + 1);
  }

  return new EmbedBuilder()
    .setTitle('📊 System Analytics Dashboard')
    .setColor(Colors.PRIMARY)
    .setDescription(
      `### ⚡ Database Metrics Overview\n${overviewLine}\n\n` +
      `### 🔑 Licenses by Type\n${typesFormatted}\n\n` +
      `### 🔌 Licenses by Registered Plugin\n${pluginsFormatted}`
    )
    .setFooter({ text: 'Stats are cached for up to 60 seconds • Cipher License' })
    .setTimestamp();
}

/**
 * Generate paginated audit log.
 */
export function createAuditEmbed(logs, page, totalPages) {
  const embed = new EmbedBuilder()
    .setTitle('🛡️ Security Audit Ledger')
    .setColor(Colors.NEUTRAL)
    .setFooter({ text: `Page ${page}/${totalPages} • Cipher License` })
    .setTimestamp();

  if (logs.length === 0) {
    embed.setDescription('*No audit logs recorded in this segment.*');
    return embed;
  }

  const lines = logs.map((log, index) => {
    const actor = userMention(log.actorId);
    const action = log.action.toUpperCase();
    
    let emoji = '⚙️';
    if (action.includes('GENERATE')) emoji = '🔑';
    if (action.includes('VERIFY')) emoji = '📡';
    if (action.includes('REVOKE')) emoji = '❌';
    if (action.includes('SUSPEND')) emoji = '🔒';
    if (action.includes('REACTIVATE')) emoji = '🔓';
    if (action.includes('BLACKLIST_ADD')) emoji = '🚫';
    if (action.includes('BLACKLIST_REMOVE')) emoji = '✅';
    if (action.includes('TRANSFER')) emoji = '🔄';

    const key = log.targetKey ? inlineCode(log.targetKey) : 'N/A';
    const time = formatDate(log.timestamp);

    return `\`${index + 1 + (page - 1) * 10}.\` ${emoji} ${actor} ➔ **${action}** on ${key}\n└ ${time}`;
  });

  embed.setDescription(lines.join('\n\n'));
  return embed;
}

/**
 * Generate blacklist directory.
 */
export function createBlacklistEmbed(entries) {
  const embed = new EmbedBuilder()
    .setTitle('🚫 Global Blacklist Registry')
    .setColor(Colors.DANGER)
    .setFooter({ text: '• Cipher License' })
    .setTimestamp();

  if (entries.length === 0) {
    embed.setDescription('*The global blacklist is currently empty.*');
    return embed;
  }

  const lines = entries.map((entry, index) => {
    const val = inlineCode(entry.value.length > 30 ? `${entry.value.slice(0, 30)}…` : entry.value);
    const type = entry.type.toUpperCase();
    const reason = entry.reason;
    const banner = userMention(entry.addedBy);

    return `\`${index + 1}.\` **[${type}]** ${val}\n└ 💬 *"${reason}"*  •  Blocked by ${banner}`;
  });

  embed.setDescription(lines.join('\n\n'));
  return embed;
}
