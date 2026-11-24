// Root owners: the people who own this bot.
//
// The two below are built in, so every copy of the bot knows them without any
// setting. OWNER_USER_ID can add more (one ID or several, separated by commas
// or spaces) but can't remove the built-in ones.
//
// Root owners are permanent: they are always "owner" on the dashboard (nobody
// can demote or ban them there), and in every server the bot is in they pass
// the bot's own permission checks (Manage Server, mod commands, DJ, ...).
// The first ID is the main owner: health alerts and backup DMs go to them.
const BUILT_IN = [
  '168281178309132288', // Hazel
  '481051702850617346', // pokeofevil
];

const fromEnv = () => String(process.env.OWNER_USER_ID || '')
  .split(/[\s,;]+/)
  .map((s) => s.trim())
  .filter((s) => /^\d{15,22}$/.test(s));

const ids = () => [...new Set([...BUILT_IN, ...fromEnv()])];

const primary = () => ids()[0] || null;
const isOwner = (userId) => !!userId && ids().includes(String(userId));

module.exports = { BUILT_IN, ids, primary, isOwner };
