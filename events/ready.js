const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`◆ Uplink stable · Logged in as ${client.user.tag}`);
    client.user.setActivity('cosmic transmissions · /help', { type: ActivityType.Listening });
  },
};
