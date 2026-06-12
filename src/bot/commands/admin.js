import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  bold,
  inlineCode,
  MessageFlags,
} from 'discord.js';
import Blacklist from '../../db/models/Blacklist.js';
import AuditLog from '../../db/models/AuditLog.js';
import Plugin from '../../db/models/Plugin.js';
import License from '../../db/models/License.js';
import { getStats, addBlacklist, removeBlacklist } from '../../services/licenseService.js';
import { createStatsEmbed, createAuditEmbed, createBlacklistEmbed } from '../embeds/adminEmbeds.js';
import {
  createSuccessEmbed,
  createErrorEmbed,
  createWarningEmbed,
} from '../embeds/commonEmbeds.js';
import { blacklistAddSchema, pluginCreateSchema } from '../../utils/validators.js';
import { AUDIT_ACTIONS } from '../../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Administrator command dashboard')
  // 1. Stats subcommand
  .addSubcommand((sub) =>
    sub.setName('stats').setDescription('View administrator dashboard and system metrics'),
  )
  // 2. Audit subcommand
  .addSubcommand((sub) =>
    sub
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
      }),
  )
  // 3. Blacklist Subcommand Group
  .addSubcommandGroup((group) =>
    group
      .setName('blacklist')
      .setDescription('Manage the global system blacklist')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Add an item to the global blacklist')
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
      ),
  )
  // 4. Plugin Subcommand Group
  .addSubcommandGroup((group) =>
    group
      .setName('plugin')
      .setDescription('Manage registered Minecraft plugins')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Register a new Minecraft plugin')
          .addStringOption((opt) =>
            opt.setName('name').setDescription('Display name of the plugin').setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName('slug')
              .setDescription('Unique lowercase url-friendly slug (e.g. my-plugin)')
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName('version')
              .setDescription('Current release version (default: 1.0.0)')
              .setRequired(false),
          )
          .addStringOption((opt) =>
            opt
              .setName('description')
              .setDescription('Short description of the plugin')
              .setRequired(false),
          )
          .addStringOption((opt) =>
            opt
              .setName('icon-url')
              .setDescription('URL to the plugin icon image')
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('update')
          .setDescription('Update an existing plugin registry')
          .addStringOption((opt) =>
            opt
              .setName('slug')
              .setDescription('The slug of the plugin to update')
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('name').setDescription('New display name').setRequired(false),
          )
          .addStringOption((opt) =>
            opt.setName('version').setDescription('New release version').setRequired(false),
          )
          .addStringOption((opt) =>
            opt.setName('description').setDescription('New description').setRequired(false),
          )
          .addStringOption((opt) =>
            opt.setName('icon-url').setDescription('New icon URL').setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Unregister a plugin')
          .addStringOption((opt) =>
            opt
              .setName('slug')
              .setDescription('The slug of the plugin to delete')
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('List all registered plugins')),
  );

export const adminOnly = true;

/**
 * Execute command actions.
 */
export async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  // A. Admin Stats
  if (subcommand === 'stats' && !group) {
    try {
      const stats = await getStats();
      const embed = createStatsEmbed(stats);
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch {
      const errEmbed = createErrorEmbed(
        'Statistics Error',
        'Failed to calculate system statistics.',
      );
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // B. Admin Audit
  if (subcommand === 'audit' && !group) {
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

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      const errEmbed = createErrorEmbed('Query Failed', 'Failed to retrieve audit log registry.');
      await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // C. Blacklist Actions
  if (group === 'blacklist') {
    if (subcommand === 'add') {
      const type = interaction.options.getString('type');
      const value = interaction.options.getString('value').trim();
      const reason = interaction.options.getString('reason');

      const validation = blacklistAddSchema.safeParse({ type, value, reason });
      if (!validation.success) {
        const errEmbed = createErrorEmbed('Validation Failed', 'Provided inputs are invalid.');
        return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      try {
        await addBlacklist({ type, value, reason }, interaction.user.id);
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
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        const msg = err.code === 11000 ? 'This item is already blacklisted.' : err.message;
        const errEmbed = createErrorEmbed('Operation Failed', msg);
        await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (subcommand === 'remove') {
      const type = interaction.options.getString('type');
      const value = interaction.options.getString('value').trim();

      try {
        const res = await removeBlacklist({ type, value }, interaction.user.id);
        if (!res) {
          const errEmbed = createErrorEmbed(
            'Not Found',
            'No blacklist entry matches those parameters.',
          );
          return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
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
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        const errEmbed = createErrorEmbed('Operation Failed', err.message);
        await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (subcommand === 'list') {
      try {
        const list = await Blacklist.find().sort({ createdAt: -1 }).lean();
        const embed = createBlacklistEmbed(list);
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch {
        const errEmbed = createErrorEmbed(
          'Query Failed',
          'Unable to retrieve blacklist directory.',
        );
        await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  // D. Plugin Actions
  if (group === 'plugin') {
    if (subcommand === 'add') {
      const name = interaction.options.getString('name').trim();
      const slug = interaction.options.getString('slug').trim().toLowerCase();
      const version = interaction.options.getString('version') || '1.0.0';
      const description = interaction.options.getString('description') || '';
      const iconUrl = interaction.options.getString('icon-url') || undefined;

      const validation = pluginCreateSchema.safeParse({
        name,
        slug,
        version,
        description,
        iconUrl,
      });
      if (!validation.success) {
        const errEmbed = createErrorEmbed(
          'Validation Failed',
          'Inputs are invalid. Check slug requirements (lowercase, alphanumeric, dashes).',
        );
        return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      try {
        const plugin = await Plugin.create({
          name,
          slug,
          version,
          description,
          iconUrl,
          createdBy: interaction.user.id,
        });

        const embed = createSuccessEmbed(
          'Plugin Registered',
          `Successfully registered plugin ${bold(plugin.name)} (${inlineCode(plugin.slug)})`,
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        const msg =
          err.code === 11000 ? 'A plugin with this slug is already registered.' : err.message;
        const errEmbed = createErrorEmbed('Operation Failed', msg);
        await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (subcommand === 'update') {
      const slug = interaction.options.getString('slug').trim().toLowerCase();
      const name = interaction.options.getString('name');
      const version = interaction.options.getString('version');
      const description = interaction.options.getString('description');
      const iconUrl = interaction.options.getString('icon-url');

      try {
        const plugin = await Plugin.findOne({ slug });
        if (!plugin) {
          const errEmbed = createErrorEmbed(
            'Not Found',
            'No registered plugin found matching that slug.',
          );
          return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
        }

        if (name) plugin.name = name.trim();
        if (version) plugin.version = version.trim();
        if (description) plugin.description = description.trim();
        if (iconUrl) plugin.iconUrl = iconUrl.trim();

        await plugin.save();

        const embed = createSuccessEmbed(
          'Plugin Updated',
          `Successfully updated configuration for plugin ${bold(plugin.name)}.`,
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        const errEmbed = createErrorEmbed('Operation Failed', err.message);
        await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (subcommand === 'remove') {
      const slug = interaction.options.getString('slug').trim().toLowerCase();

      try {
        const plugin = await Plugin.findOne({ slug });
        if (!plugin) {
          const errEmbed = createErrorEmbed(
            'Not Found',
            'No registered plugin found matching that slug.',
          );
          return await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
        }

        const activeLicensesCount = await License.countDocuments({ pluginId: plugin._id });
        if (activeLicensesCount > 0) {
          const warnEmbed = createWarningEmbed(
            'Dangling References Detected',
            `Cannot remove plugin ${bold(plugin.name)}: there are ${bold(
              activeLicensesCount.toString(),
            )} active licenses associated with this plugin.\n\nRevoke or reassign those licenses first.`,
          );
          return await interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
        }

        await Plugin.findByIdAndDelete(plugin._id);

        const embed = createSuccessEmbed(
          'Plugin Unregistered',
          `Successfully removed plugin ${bold(plugin.name)} from database.`,
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (err) {
        const errEmbed = createErrorEmbed('Operation Failed', err.message);
        await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (subcommand === 'list') {
      try {
        const list = await Plugin.find().sort({ name: 1 }).lean();
        if (list.length === 0) {
          const embed = createWarningEmbed(
            'Empty Registry',
            'No plugins are currently registered.',
          );
          return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const lines = list.map((p, index) => {
          return `${bold((index + 1).toString())}. ${bold(p.name)} | Slug: ${inlineCode(p.slug)} | Version: \`v${p.version}\``;
        });

        const embed = createSuccessEmbed('Registered Plugins Directory', lines.join('\n'));
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch {
        const errEmbed = createErrorEmbed('Query Failed', 'Failed to retrieve plugin listings.');
        await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }
    }
  }
}
