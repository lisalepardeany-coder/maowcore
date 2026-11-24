// Root owners: the people who own this bot, set in OWNER_USER_ID.
//
// OWNER_USER_ID takes one Discord user ID or several, separated by commas or
// spaces:  OWNER_USER_ID=168281178309132288,481051702850617346
//
// Root owners are permanent: they are always "owner" on the dashboard (nobody
// can demote or ban them there), and in every server the bot is in they pass
// the bot's own permission checks (Manage Server, mod commands, DJ, ...).
// The first ID is the main owner: health alerts and backup DMs go to them.
const ids = () => String(process.env.OWNER_USER_ID || '')
  .split(/[\s,;]+/)
  .map((s) => s.trim())
  .filter((s) => /^\d{15,22}$/.test(s));

const primary = () => ids()[0] || null;
const isOwner = (userId) => !!userId && ids().includes(String(userId));

module.exports = { ids, primary, isOwner };
