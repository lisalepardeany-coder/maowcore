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
