import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Plugin from '../../../db/models/Plugin.js';
import { listLicenses } from '../../../services/licenseService.js';
import { createLicenseListEmbed } from '../../embeds/licenseEmbeds.js';
import { createErrorEmbed } from '../../embeds/commonEmbeds.js';

export const data = new SlashCommandBuilder()
  .setName('list')
  .setDescription('List licenses with filtering and pagination')
  .addUserOption((option) =>
    option.setName('user').setDescription('Filter licenses by owner').setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName('plugin')
      .setDescription('Filter licenses by plugin')
      .setRequired(false)
      .setAutocomplete(true),
  )
  .addStringOption((option) =>
    option
      .setName('status')
      .setDescription('Filter by license status')
      .setRequired(false)
      .addChoices(
        { name: 'Active', value: 'active' },
        { name: 'Suspended', value: 'suspended' },
        { name: 'Revoked', value: 'revoked' },
        { name: 'Expired', value: 'expired' },
      ),
  );

/**
 * Handle autocomplete.
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'plugin') return;

  try {
    const list = await Plugin.find({
      $or: [
        { name: { $regex: focused.value, $options: 'i' } },
        { slug: { $regex: focused.value, $options: 'i' } },
      ],
    })
      .limit(25)
      .lean();

    await interaction.respond(
      list.map((p) => ({
        name: `${p.name} (${p.slug})`,
        value: p._id.toString(),
      })),
    );
  } catch (err) {
    await interaction.respond([]);
  }
}

/**
 * Execute command.
 */
export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const pluginId = interaction.options.getString('plugin');
  const status = interaction.options.getString('status');

  const ownerId = user ? user.id : null;

  try {
    const { licenses, page, totalPages } = await listLicenses({
      ownerId,
      pluginId,
      status,
      page: 1,
      limit: 10,
    });

    const embed = createLicenseListEmbed(licenses, page, totalPages);

    // Build pagination buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`list:${ownerId || ''}:${pluginId || ''}:${status || ''}:${page - 1}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`list:${ownerId || ''}:${pluginId || ''}:${status || ''}:${page + 1}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages),
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } catch (err) {
    const errEmbed = createErrorEmbed('Query Failed', 'Unable to retrieve license list.');
    await interaction.reply({ embeds: [errEmbed], ephemeral: true });
  }
}
