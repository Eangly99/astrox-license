import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import AuditLog from '../../../db/models/AuditLog.js';
import { createAuditEmbed } from '../../embeds/adminEmbeds.js';
import { createErrorEmbed } from '../../embeds/commonEmbeds.js';
import { AUDIT_ACTIONS } from '../../../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('audit')
  .setDescription('View system audit log records')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Filter logs by executing user').setRequired(false),
  )
  .addStringOption((opt) => {
    const option = opt
      .setName('action')
      .setDescription('Filter by audit action')
      .setRequired(false);

    Object.values(AUDIT_ACTIONS).forEach((action) => {
      option.addChoices({ name: action.toUpperCase(), value: action });
    });

    return option;
  });

export const adminOnly = true;

/**
 * Execute command.
 */
export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const action = interaction.options.getString('action');

  const actorId = user ? user.id : null;

  try {
    const query = {};
    if (actorId) query.actorId = actorId;
    if (action) query.action = action;

    const total = await AuditLog.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / 10));
    const page = 1;
    const skip = (page - 1) * 10;

    const logs = await AuditLog.find(query).sort({ timestamp: -1 }).skip(skip).limit(10).lean();

    const embed = createAuditEmbed(logs, page, totalPages);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`audit:${actorId || ''}:${action || ''}:${page - 1}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`audit:${actorId || ''}:${action || ''}:${page + 1}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages),
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } catch (err) {
    const errEmbed = createErrorEmbed('Query Failed', 'Failed to retrieve audit log registry.');
    await interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
