/*─────────────────────────────────────────
  lib/lid.js - LID/PN resolver
─────────────────────────────────────────*/

import { jidDecode, jidNormalizedUser } from '@whiskeysockets/baileys';

export function decodeJid(jid) {
  if (!jid) return jid;
  if (/:\d+@/gi.test(jid)) {
    const decoded = jidDecode(jid) || {};
    return decoded.user && decoded.server ? `${decoded.user}@${decoded.server}` : jid;
  }
  return jidNormalizedUser(jid);
}

export function isLidJid(jid) {
  return typeof jid === 'string' && decodeJid(jid)?.endsWith('@lid');
}

export function isPhoneJid(jid) {
  return typeof jid === 'string' && decodeJid(jid)?.endsWith('@s.whatsapp.net');
}

export function toPhoneJid(value) {
  if (!value) return null;
  const text = String(value);
  if (text.endsWith('@s.whatsapp.net')) return decodeJid(text);
  if (text.endsWith('@lid') || text.endsWith('@g.us')) return null;
  const number = text.replace(/[^0-9]/g, '');
  return number ? `${number}@s.whatsapp.net` : null;
}

function getLidDb() {
  if (!global.db) global.db = {};
  if (!global.db.data) global.db.data = {};
  if (!global.db.data.lid) global.db.data.lid = {};
  if (!global.db.data.lid.lids) global.db.data.lid.lids = {};
  if (!global.db.data.lid.phones) global.db.data.lid.phones = {};
  return global.db.data.lid;
}

export function rememberLid(lid, phone, extra = {}) {
  const lidJid = decodeJid(lid);
  const phoneJid = toPhoneJid(phone);
  if (!isLidJid(lidJid) || !phoneJid) return null;

  const db = getLidDb();
  const now = Date.now();
  const current = db.lids[lidJid] || {};
  const record = {
    ...current,
    lid: lidJid,
    pn: phoneJid,
    jid: phoneJid,
    phoneNumber: phoneJid,
    name: extra.name || current.name || '',
    source: extra.source || current.source || 'runtime',
    updatedAt: now,
  };

  db.lids[lidJid] = record;
  db.phones[phoneJid] = lidJid;

  if (!global.lidMap) global.lidMap = new Map();
  global.lidMap.set(lidJid, phoneJid);
  return phoneJid;
}

export function syncLidFromContact(contact, source = 'contact') {
  if (!contact) return null;
  const lid = contact.lid || (isLidJid(contact.id) ? contact.id : null);
  const phone = contact.phoneNumber || (isPhoneJid(contact.id) ? contact.id : null) || toPhoneJid(contact.jid);
  return rememberLid(lid, phone, {
    source,
    name: contact.name || contact.notify || contact.vname || contact.pushName,
  });
}

export function syncLidFromParticipant(participant, source = 'participant') {
  if (!participant) return null;
  if (typeof participant === 'string') return isLidJid(participant) ? null : decodeJid(participant);
  const lid = participant.lid || (isLidJid(participant.id) ? participant.id : null);
  const phone = participant.phoneNumber || participant.jid || (isPhoneJid(participant.id) ? participant.id : null);
  return rememberLid(lid, phone, { source, name: participant.name || participant.notify });
}

export function syncLidFromMessageKey(key, source = 'message-key') {
  if (!key) return null;
  const pairs = [
    [key.participant, key.participantAlt],
    [key.remoteJid, key.remoteJidAlt],
  ];

  let resolved = null;
  for (const [a, b] of pairs) {
    if (isLidJid(a) && isPhoneJid(b)) resolved = rememberLid(a, b, { source });
    if (isLidJid(b) && isPhoneJid(a)) resolved = rememberLid(b, a, { source });
  }
  return resolved;
}

export function syncLidFromGroupMetadata(metadata, source = 'group-metadata') {
  for (const participant of metadata?.participants || []) {
    syncLidFromParticipant(participant, source);
  }
}

function findInStore(lid, store) {
  for (const meta of Object.values(store?.groupMetadata || {})) {
    for (const participant of meta?.participants || []) {
      const found = syncLidFromParticipant(participant, 'store-group');
      if (found && (participant.id === lid || participant.lid === lid)) return found;
    }
  }

  for (const contact of Object.values(store?.contacts || {})) {
    const found = syncLidFromContact(contact, 'store-contact');
    if (found && (contact.id === lid || contact.lid === lid)) return found;
  }

  return null;
}

export function resolveLid(jid, store = global.store) {
  const normalized = decodeJid(jid);
  if (!normalized || !isLidJid(normalized)) return normalized;

  const db = getLidDb();
  const cached = db.lids[normalized]?.pn || global.lidMap?.get(normalized);
  if (cached) return decodeJid(cached);

  const found = findInStore(normalized, store);
  return found || normalized;
}

export function resolveJid(jid, store = global.store) {
  return resolveLid(jid, store);
}

export function sameJid(a, b, store = global.store) {
  return resolveJid(a, store) === resolveJid(b, store);
}

