require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  }
}

// Per-bot command prefix. When running multiple MaowCore instances in the
// same Discord server, set COMMAND_PREFIX in each bot's .env so its
// commands don't collide with the others'. e.g. COMMAND_PREFIX=b2 turns
// every command name "play" into "b2-play". Discord caps command names at
// 32 chars total; we clamp to keep within the limit.
const PREFIX = (process.env.COMMAND_PREFIX || '').trim().toLowerCase();
if (PREFIX) {
  if (!/^[a-z0-9_]+$/.test(PREFIX)) {
    console.error(`COMMAND_PREFIX must be lowercase letters/digits/underscores only — got "${PREFIX}"`);
    process.exit(1);
  }
  for (const c of commands) {
    c.name = `${PREFIX}-${c.name}`.slice(0, 32);
  }
  console.log(`Applied COMMAND_PREFIX="${PREFIX}" → all commands renamed (e.g. /play → /${PREFIX}-play)`);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (process.env.GUILD_ID) {
      // When deploying to a guild, wipe global commands so they don't show up as duplicates.
      console.log('Clearing global commands to avoid duplicates...');
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });

      console.log(`Refreshing ${commands.length} guild commands...`);
      const data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log(`Reloaded ${data.length} commands (guild).`);
    } else {
      console.log(`Refreshing ${commands.length} global commands...`);
      const data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log(`Reloaded ${data.length} commands (global).`);
    }
  } catch (err) {
    console.error(err);
  }
})();
