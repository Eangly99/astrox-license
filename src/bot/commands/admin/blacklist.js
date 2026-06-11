import { SlashCommandBuilder } from 'discord.js';
import Blacklist from '../../../db/models/Blacklist.js';
import AuditLog from '../../../db/models/AuditLog.js';
import { createSuccessEmbed, createErrorEmbed } from '../../embeds/commonEmbeds.js';
import { createBlacklistEmbed } from '../../embeds/adminEmbeds.js';
import { blacklistAddSchema } from '../../../utils/validators.js';
import { AUDIT_ACTIONS } from '../../../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('blacklist')
  .setDescription('Manage the global system blacklist')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a key, IP, or HWID to the global blacklist')
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('The item category')
          .setRequired(true)
          .addChoices(
            { name: 'License Key', value: 'key' },
            { name: 'Hardware ID (HWID)', value: 'hwid' },
            { name: 'IP Address', value: 'ip' },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName('value')
          .setDescription('The key, IP, or HWID string to block')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('The reason for blacklisting').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove an item from the global blacklist')
      .addStringOption((opt) =>
        opt
          .setName('type')
          .setDescription('The item category')
          .setRequired(true)
          .addChoices(
            { name: 'License Key', value: 'key' },
            { name: 'Hardware ID (HWID)', value: 'hwid' },
            { name: 'IP Address', value: 'ip' },
          ),
      )
      .addStringOption((opt) =>
        opt.setName('value').setDescription('The blocked value to remove').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('List all currently blacklisted items'),
  );

export const adminOnly = true;

/**
 * Execute command.
 */
export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  // 1. Blacklist Add
  if (subcommand === 'add') {
    const type = interaction.options.getString('type');
    const value = interaction.options.getString('value').trim();
    const reason = interaction.options.getString('reason');

    const validation = blacklistAddSchema.safeParse({ type, value, reason });
    if (!validation.success) {
      const errEmbed = createErrorEmbed('Validation Failed', 'Provided inputs are invalid.');
      return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }

    try {
      await Blacklist.create({ type, value, reason, addedBy: interaction.user.id });
      await AuditLog.log(
        AUDIT_ACTIONS.BLACKLIST_ADD,
        interaction.user.id,
        type === 'key' ? value : null,
        {
          type,
          value: type === 'key' ? undefined : value,
          reason,
        },
      );

      const embed = createSuccessEmbed(
        'Blacklisted Successfully',
        `Blocked ${type.toUpperCase()}: \`${value}\`\nReason: ${reason}`,
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const msg = err.code === 11000 ? 'This item is already blacklisted.' : err.message;
      const errEmbed = createErrorEmbed('Operation Failed', msg);
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
    return;
  }

  // 2. Blacklist Remove
  if (subcommand === 'remove') {
    const type = interaction.options.getString('type');
    const value = interaction.options.getString('value').trim();

    try {
      const res = await Blacklist.findOneAndDelete({ type, value });
      if (!res) {
        const errEmbed = createErrorEmbed(
          'Not Found',
          'No blacklist entry matches those parameters.',
        );
        return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
      }

      await AuditLog.log(
        AUDIT_ACTIONS.BLACKLIST_REMOVE,
        interaction.user.id,
        type === 'key' ? value : null,
        {
          type,
          value: type === 'key' ? undefined : value,
        },
      );

      const embed = createSuccessEmbed(
        'Blacklist Entry Removed',
        `Removed block on ${type.toUpperCase()}: \`${value}\``,
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const errEmbed = createErrorEmbed('Operation Failed', err.message);
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
    return;
  }

  // 3. Blacklist List
  if (subcommand === 'list') {
    try {
      const list = await Blacklist.find().sort({ createdAt: -1 }).lean();
      const embed = createBlacklistEmbed(list);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const errEmbed = createErrorEmbed('Query Failed', 'Unable to retrieve blacklist directory.');
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
  }
}
