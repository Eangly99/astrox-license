import { SlashCommandBuilder, bold, inlineCode } from 'discord.js';
import Plugin from '../../../db/models/Plugin.js';
import License from '../../../db/models/License.js';
import {
  createSuccessEmbed,
  createErrorEmbed,
  createWarningEmbed,
} from '../../embeds/commonEmbeds.js';
import { pluginCreateSchema } from '../../../utils/validators.js';

export const data = new SlashCommandBuilder()
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
        opt.setName('icon-url').setDescription('URL to the plugin icon image').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('update')
      .setDescription('Update an existing plugin registry')
      .addStringOption((opt) =>
        opt.setName('slug').setDescription('The slug of the plugin to update').setRequired(true),
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
        opt.setName('slug').setDescription('The slug of the plugin to delete').setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List all registered plugins'));

export const adminOnly = true;

/**
 * Execute command.
 */
export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  // 1. Plugin Add
  if (subcommand === 'add') {
    const name = interaction.options.getString('name').trim();
    const slug = interaction.options.getString('slug').trim().toLowerCase();
    const version = interaction.options.getString('version') || '1.0.0';
    const description = interaction.options.getString('description') || '';
    const iconUrl = interaction.options.getString('icon-url') || undefined;

    const validation = pluginCreateSchema.safeParse({ name, slug, version, description, iconUrl });
    if (!validation.success) {
      const errEmbed = createErrorEmbed(
        'Validation Failed',
        'Inputs are invalid. Check slug requirements (lowercase, alphanumeric, dashes).',
      );
      return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
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
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const msg =
        err.code === 11000 ? 'A plugin with this slug is already registered.' : err.message;
      const errEmbed = createErrorEmbed('Operation Failed', msg);
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
    return;
  }

  // 2. Plugin Update
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
        return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
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
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const errEmbed = createErrorEmbed('Operation Failed', err.message);
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
    return;
  }

  // 3. Plugin Remove
  if (subcommand === 'remove') {
    const slug = interaction.options.getString('slug').trim().toLowerCase();

    try {
      const plugin = await Plugin.findOne({ slug });
      if (!plugin) {
        const errEmbed = createErrorEmbed(
          'Not Found',
          'No registered plugin found matching that slug.',
        );
        return await interaction.reply({ embeds: [errEmbed], ephemeral: true });
      }

      // Check for active licenses
      const activeLicensesCount = await License.countDocuments({ pluginId: plugin._id });
      if (activeLicensesCount > 0) {
        const warnEmbed = createWarningEmbed(
          'Dangling References Detected',
          `Cannot remove plugin ${bold(plugin.name)}: there are ${bold(activeLicensesCount.toString())} active licenses associated with this plugin.\n\nRevoke or reassign those licenses first.`,
        );
        return await interaction.reply({ embeds: [warnEmbed], ephemeral: true });
      }

      await Plugin.findByIdAndDelete(plugin._id);

      const embed = createSuccessEmbed(
        'Plugin Unregistered',
        `Successfully removed plugin ${bold(plugin.name)} from database.`,
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const errEmbed = createErrorEmbed('Operation Failed', err.message);
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
    return;
  }

  // 4. Plugin List
  if (subcommand === 'list') {
    try {
      const list = await Plugin.find().sort({ name: 1 }).lean();
      if (list.length === 0) {
        const embed = createWarningEmbed('Empty Registry', 'No plugins are currently registered.');
        return await interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const lines = list.map((p, index) => {
        return `${bold((index + 1).toString())}. ${bold(p.name)} | Slug: ${inlineCode(p.slug)} | Version: \`v${p.version}\``;
      });

      const embed = createSuccessEmbed('Registered Plugins Directory', lines.join('\n'));
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      const errEmbed = createErrorEmbed('Query Failed', 'Failed to retrieve plugin listings.');
      await interaction.reply({ embeds: [errEmbed], ephemeral: true });
    }
  }
}
