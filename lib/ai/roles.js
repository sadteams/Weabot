import { resolveJid, sameJid } from '../lid.js';

function ownerJids() {
  return (global.owner || [])
    .map((owner) => Array.isArray(owner) ? owner[0] : owner)
    .filter(Boolean)
    .map((owner) => String(owner).replace(/[^0-9]/g, ''))
    .filter(Boolean)
    .flatMap((number) => [`${number}@s.whatsapp.net`, `${number}@lid`]);
}

export function resolveUserRole(m, conn, context = {}) {
  const sender = conn?.getJid ? conn.getJid(m?.sender) : resolveJid(m?.sender);
  const userData = global.db?.data?.users?.[sender] || {};
  const owners = ownerJids();
  const botJid = conn?.decodeJid?.(conn?.user?.id);
  const isROwner = !!sender && (owners.some((jid) => sameJid(jid, sender)) || sameJid(botJid, sender));
  const isOwner = isROwner || !!m?.fromMe || !!context.isOwner;
  const isPremium = !!userData.premium || isOwner;
  const isModerator = !!userData.moderator || isOwner;
  const isAdmin = !!context.isAdmin;
  const isBotAdmin = !!context.isBotAdmin;

  let role = 'user';
  if (isOwner) role = 'owner';
  else if (isModerator) role = 'moderator';
  else if (isPremium) role = 'premium';
  else if (isAdmin) role = 'admin';

  return {
    jid: sender,
    number: String(sender || '').split('@')[0].replace(/[^0-9]/g, ''),
    role,
    isROwner,
    isOwner,
    isPremium,
    isModerator,
    isAdmin,
    isBotAdmin,
    user: userData,
  };
}

export function roleAllows(required = [], roleInfo = {}) {
  const roles = Array.isArray(required) ? required : [required];
  if (!roles.length) return true;
  if (roleInfo.isOwner) return true;
  return roles.includes(roleInfo.role)
    || (roleInfo.isPremium && roles.includes('premium'))
    || (roleInfo.isModerator && roles.includes('moderator'))
    || (roleInfo.isAdmin && roles.includes('admin'));
}
