// Discord's role-order rule, for actions the bot does on someone's behalf.
//
// Discord stops a moderator from banning someone above them, or handing out a
// role above their own, in its own menus. A bot acting for them skips that:
// the bot only checks ITS role. So without these checks anyone with Ban
// Members / Manage Roles could ban the admins or give themselves an admin role,
// as long as the bot's role is higher. The server owner and the bot's owners
// (OWNER_USER_ID) are allowed everything, like in Discord.
const owners = require('./owners');

const isBoss = (member) => !!member && (member.id === member.guild?.ownerId || owners.isOwner(member.id));
const top = (member) => member?.roles?.highest?.position ?? 0;

// May `actor` give or take away `role`? Only roles below their own highest role.
const canAssignRole = (actor, role) => {
  if (!actor || !role) return false;
  if (isBoss(actor)) return true;
  return role.position < top(actor);
};

// May `actor` moderate `target` (kick, ban, time out, rename)? Only members whose
// highest role is below theirs; never the server owner. `target` null means the
// user isn't in the server (banning by ID): there is nothing to compare.
const canModerate = (actor, target, { allowSelf = false } = {}) => {
  if (!target) return true;
  if (!actor) return false;
  if (actor.id === target.id) return allowSelf;
  if (target.id === target.guild?.ownerId) return false;
  if (isBoss(actor)) return true;
  return top(target) < top(actor);
};

// The full member behind an interaction (interaction.member can be a bare API
// object without roles when the guild member isn't cached).
const actorOf = async (interaction) => {
  const m = interaction.member;
  if (m?.roles?.highest) return m;
  return interaction.guild?.members.fetch(interaction.user.id).catch(() => null) ?? null;
};

const ROLE_MSG = '◌ You can only give or take away roles below your own highest role.';
const MOD_MSG = '◌ You can only do that to members whose highest role is below yours (and never to the server owner).';

module.exports = { canAssignRole, canModerate, actorOf, ROLE_MSG, MOD_MSG };
