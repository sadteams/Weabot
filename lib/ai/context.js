import { resolveJid } from '../lid.js';

function safeText(value, limit = 900) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function userDataFor(jid) {
  const resolved = resolveJid(jid);
  return global.db?.data?.users?.[resolved] || global.db?.data?.users?.[jid] || {};
}

function registeredAge(user = {}) {
  const value = user.age ?? user.umur;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export async function buildUserContext({ conn, m, roleInfo } = {}) {
  const sender = conn?.getJid ? conn.getJid(m?.sender) : resolveJid(m?.sender);
  const user = userDataFor(sender);
  const chatName = m?.isGroup
    ? (global.store?.groupMetadata?.[m.chat]?.subject || m.chat)
    : 'Private chat';
  let displayName = m?.pushName || m?.name || user.name || '';
  if ((!displayName || /^\d+$/.test(displayName)) && conn?.getName) {
    displayName = await conn.getName(sender).catch(() => displayName);
  }

  const quoted = m?.quoted ? {
    sender: conn?.getJid ? conn.getJid(m.quoted.sender) : resolveJid(m.quoted.sender),
    name: m.quoted.name || '',
    text: safeText(m.quoted.text || m.quoted.body || ''),
    type: m.quoted.mtype || m.quoted.type || '',
  } : null;

  return {
    jid: sender,
    number: String(sender || '').split('@')[0],
    name: displayName || String(sender || '').split('@')[0],
    role: roleInfo?.role || 'user',
    isOwner: !!roleInfo?.isOwner,
    isPremium: !!roleInfo?.isPremium,
    isModerator: !!roleInfo?.isModerator,
    registered: !!user.registered,
    age: registeredAge(user),
    level: user.level ?? null,
    limit: user.limit ?? null,
    chat: m?.chat,
    chatName,
    isGroup: !!m?.isGroup,
    quoted,
  };
}

export function formatUserContext(context = {}) {
  const lines = [
    `Nama user: ${context.name || '-'}`,
    `JID user: ${context.jid || '-'}`,
    `Role user: ${context.role || 'user'}`,
    `Premium: ${context.isPremium ? 'ya' : 'tidak'}`,
    `Owner: ${context.isOwner ? 'ya' : 'tidak'}`,
    `Terdaftar: ${context.registered ? 'ya' : 'tidak'}`,
    `Umur: ${context.age || 'belum diketahui'}`,
    `Chat: ${context.chatName || context.chat || '-'}`,
  ];
  if (context.quoted) {
    lines.push('Pesan yang dibalas user:');
    lines.push(`- Pengirim quoted: ${context.quoted.name || context.quoted.sender || '-'}`);
    lines.push(`- Tipe quoted: ${context.quoted.type || '-'}`);
    lines.push(`- Isi quoted: ${context.quoted.text || '[non-teks/media]'}`);
  }
  return lines.join('\n');
}
