import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
  rest: { timeout: 15_000 },
});

client.commands = new Collection();
client.cooldowns = new Collection();

export { client };
