import path from 'path';
import { promises as fsp } from 'fs';
import { fileURLToPath } from 'url';
import qrcodeTerminal from 'qrcode-terminal';

import Connection from './connection.js';
import { createStore } from './database-manager.js';
import { handler, participantsUpdate } from '../handler.js';
import appLogger from './logger.js';
import { ensureDir, readJson, writeJson, jidNumber, normalizePhone, delay } from './helper.js';
import { resolveJid, isLidJid } from './lid.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sessionRoot = path.join(rootDir, 'session', 'jadibot');
const dataRoot = path.join(rootDir, 'database', 'jadibot');
const storeRoot = path.join(dataRoot, 'store');
const registryFile = path.join(dataRoot, 'sessions.json');
const storeIntervals = new Map();

function ensureDirs() {
  ensureDir(sessionRoot);
  ensureDir(storeRoot);
}

function readRegistry() {
  return readJson(registryFile, { sessions: {} });
}

function writeRegistry(data) {
  writeJson(registryFile, data);
}

function normalizeSessionId(value) {
  return String(value || '')
    .replace(/@/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function requesterIdentity(requester) {
  const resolved = resolveJid(requester);
  const normalized = resolved || requester;
  const number = isLidJid(normalized) ? '' : jidNumber(normalized);
  const id = number || normalizeSessionId(normalized) || String(Date.now());
  return { id, jid: normalized, number };
}


function getSessionPaths(id) {
  return {
    sessionDir: path.join(sessionRoot, id),
    storeFile: path.join(storeRoot, `${id}.json`),
  };
}

function sessionRank(session) {
  return Number(session.updatedAt || session.lastConnected || session.createdAt || 0);
}

async function qrToImageBuffer(qr) {
  try {
    const qrcode = await import('qrcode');
    const dataUrl = await qrcode.toDataURL(qr, { scale: 8, margin: 2 });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  } catch {
    return null;
  }
}

function qrToText(qr) {
  return new Promise((resolve) => {
    qrcodeTerminal.generate(qr, { small: true }, (text) => resolve(text));
  });
}

function updateSession(id, patch) {
  const registry = readRegistry();
  registry.sessions ||= {};
  registry.sessions[id] = {
    ...(registry.sessions[id] || {}),
    ...patch,
    updatedAt: Date.now(),
  };
  writeRegistry(registry);
  return registry.sessions[id];
}

function removeSession(id) {
  const registry = readRegistry();
  if (registry.sessions?.[id]) {
    registry.sessions[id].status = 'stopped';
    registry.sessions[id].stoppedAt = Date.now();
    registry.sessions[id].updatedAt = Date.now();
    writeRegistry(registry);
  }
}

function findSessionByRequester(requester, options = {}) {
  const identity = requesterIdentity(requester);
  if (!identity.id && !identity.number) return null;
  const includeStopped = !!options.includeStopped;
  const registry = readRegistry();
  const matches = Object.entries(registry.sessions || {})
    .filter(([id, session]) => (
      id === identity.id
      || session.requesterId === identity.id
      || (!!identity.number && session.requesterNumber === identity.number)
      || (!!identity.jid && session.requester === identity.jid)
    ))
    .filter(([, session]) => session.status !== 'deleted')
    .filter(([, session]) => includeStopped || session.status !== 'stopped')
    .sort((a, b) => sessionRank(b[1]) - sessionRank(a[1]));
  const found = matches[0];
  return found ? { id: found[0], session: found[1] } : null;
}

export function getJadibotSession(requester, options = {}) {
  const found = findSessionByRequester(requester, { includeStopped: true, ...options });
  if (!found) return null;
  return {
    id: found.id,
    active: Connection.conns.has(found.id),
    ...found.session,
  };
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function moveIfPossible(from, to) {
  if (from === to || !(await pathExists(from)) || await pathExists(to)) return false;
  ensureDir(path.dirname(to));
  await fsp.rename(from, to);
  return true;
}

async function migrateSessionId(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return newId;
  const registry = readRegistry();
  const oldSession = registry.sessions?.[oldId];
  if (!oldSession) return newId;

  if (Connection.conns.has(oldId)) {
    await Connection.stop(oldId, 'migrating jadibot session id');
    clearInterval(storeIntervals.get(oldId));
    storeIntervals.delete(oldId);
  }

  const oldPaths = getSessionPaths(oldId);
  const newPaths = getSessionPaths(newId);
  await moveIfPossible(oldPaths.sessionDir, newPaths.sessionDir);
  await moveIfPossible(oldPaths.storeFile, newPaths.storeFile);

  registry.sessions ||= {};
  registry.sessions[newId] = {
    ...oldSession,
    ...(registry.sessions[newId] || {}),
    id: newId,
    previousId: oldId,
    sessionDir: newPaths.sessionDir,
    storeFile: newPaths.storeFile,
    updatedAt: Date.now(),
  };
  delete registry.sessions[oldId];
  writeRegistry(registry);
  return newId;
}

export function listJadibots(filter = {}) {
  const registry = readRegistry();
  const identity = filter.requester ? requesterIdentity(filter.requester) : null;
  return Object.entries(registry.sessions || {})
    .filter(([id, session]) => !identity || (
      id === identity.id
      || session.requesterId === identity.id
      || (!!identity.number && session.requesterNumber === identity.number)
      || (!!identity.jid && session.requester === identity.jid)
    ))
    .map(([id, session]) => ({
      id,
      active: Connection.conns.has(id),
      ...session,
    }));
}

export function getJadibotRecipients(options = {}) {
  const sessions = listJadibots(options);
  const seen = new Set();
  const recipients = [];
  for (const session of sessions) {
    const number = session.requesterNumber || jidNumber(session.requester);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    recipients.push({
      jid: number + '@s.whatsapp.net',
      number,
      session,
    });
  }
  return recipients;
}

export async function broadcastJadibot(conn, text, options = {}) {
  const recipients = getJadibotRecipients(options);
  const result = { total: recipients.length, success: 0, failed: 0, errors: [] };

  for (const recipient of recipients) {
    try {
      await conn.sendMessage(recipient.jid, { text });
      result.success++;
      if (options.delay) await delay(options.delay);
    } catch (error) {
      result.failed++;
      result.errors.push({ jid: recipient.jid, message: error.message });
    }
  }

  return result;
}

export async function stopJadibot(idOrRequester, reason = 'stopped') {
  const found = Connection.conns.get(idOrRequester) ? { id: idOrRequester } : findSessionByRequester(idOrRequester);
  const id = found?.id || idOrRequester;
  const stopped = await Connection.stop(id, reason);
  clearInterval(storeIntervals.get(id));
  storeIntervals.delete(id);
  removeSession(id);
  return stopped;
}

export async function deleteJadibotSession(idOrRequester, reason = 'deleted') {
  const found = Connection.conns.get(idOrRequester)
    ? { id: idOrRequester }
    : findSessionByRequester(idOrRequester, { includeStopped: true });
  const id = found?.id || idOrRequester;
  await Connection.stop(id, reason).catch(() => false);
  clearInterval(storeIntervals.get(id));
  storeIntervals.delete(id);

  const { sessionDir, storeFile } = getSessionPaths(id);
  await fsp.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
  await fsp.rm(storeFile, { force: true }).catch(() => {});

  const registry = readRegistry();
  if (registry.sessions?.[id]) {
    delete registry.sessions[id];
    writeRegistry(registry);
  }
  return true;
}

export async function startJadibot({ parentConn, m, mode = 'qr', phone = '', useExisting = false, replace = false } = {}) {
  ensureDirs();
  const requester = m.sender;
  const identity = requesterIdentity(requester);
  const requesterNumber = identity.number;
  let cleanPhone = normalizePhone(phone);
  const id = identity.id;
  const previous = findSessionByRequester(requester, { includeStopped: true });
  const previousSession = previous?.session || null;

  if (replace && previous) await deleteJadibotSession(previous.id, 'replaced by requester');
  else if (previous && previous.id !== id) await migrateSessionId(previous.id, id);

  if (useExisting && !cleanPhone && previousSession?.phone) cleanPhone = normalizePhone(previousSession.phone);
  if (useExisting && previousSession?.mode) mode = previousSession.mode;

  const maxActive = Number(global.jadibotMax || 5);

  if (Connection.conns.size >= maxActive && !Connection.conns.has(id)) {
    throw new Error(`Slot jadibot penuh. Maksimal aktif: ${maxActive}.`);
  }

  const existing = Connection.conns.get(id);
  if (existing && existing.status !== 'close') {
    if (useExisting) return existing;
    throw new Error('Session jadibot untuk akun ini masih aktif atau sedang reconnect. Gunakan .stopjadibot lebih dulu.');
  }

  const { sessionDir, storeFile } = getSessionPaths(id);
  const store = createStore({ rootDir, file: storeFile });
  try { store.readFromFile(); } catch {}

  const writeStore = () => {
    try { store.writeToFile(); }
    catch (error) { appLogger.warn('jadibot', `${id} store write failed`, error.message); }
  };
  clearInterval(storeIntervals.get(id));
  storeIntervals.set(id, setInterval(writeStore, 30_000));

  updateSession(id, {
    id,
    mode,
    requester: identity.jid || requester,
    requesterId: id,
    requesterNumber,
    phone: cleanPhone || null,
    jid: null,
    status: 'connecting',
    createdAt: replace ? Date.now() : previousSession?.createdAt || Date.now(),
    sessionDir,
    storeFile,
  });

  const sendParent = (text, quoted = m) => parentConn.sendMessage(m.chat, { text }, { quoted });

  const child = await Connection.start({
    id,
    isChild: true,
    parentConn,
    sessionDir,
    store,
    loginMode: mode,
    phone: cleanPhone,
    onMessagesUpsert: handler,
    onParticipantsUpdate: participantsUpdate,
    markOnlineOnConnect: false,
    maxReconnect: 8,
    credsSaveDelay: 1200,
    onQr: async (qr) => {
      updateSession(id, { status: 'qr', lastQrAt: Date.now() });
      const caption = [
        '*Jadibot QR Login*',
        'Buka WhatsApp > Perangkat tertaut > Tautkan perangkat, lalu scan QR ini.',
        'QR akan expired otomatis. Jika gagal, ulangi perintah jadibot.'
      ].join('\n');
      const buffer = await qrToImageBuffer(qr);
      if (buffer) {
        await parentConn.sendFile(m.chat, buffer, 'jadibot-qr.png', caption, m, { mimetype: 'image/png' });
      } else {
        const terminalQr = await qrToText(qr);
        await sendParent(`${caption}\n\n${terminalQr}\n\n${qr}`);
      }
    },
    onPairingCode: async (code, pairedPhone) => {
      updateSession(id, { status: 'pairing', phone: pairedPhone, lastPairingAt: Date.now() });
      await sendParent([
        '*Jadibot Pairing Code*',
        `Nomor: ${pairedPhone}`,
        `Kode: *${code}*`,
        '',
        'Buka WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon, lalu masukkan kode di atas.'
      ].join('\n'));
    },
    onPairingError: async (error) => {
      updateSession(id, { status: 'pairing_error', error: error.message });
      await sendParent(`Gagal membuat pairing code: ${error.message}`);
    },
    onOpen: async (conn) => {
      updateSession(id, {
        status: 'open',
        jid: conn.user?.id || null,
        name: conn.user?.name || conn.user?.verifiedName || null,
        lastConnected: Date.now(),
      });
      writeStore();
      await sendParent([
        '*Jadibot tersambung*',
        `ID Session: ${id}`,
        `Akun: ${conn.user?.id || '-'}`,
        '',
        'Gunakan .stopjadibot untuk menghentikan session ini.'
      ].join('\n'));
    },
    onClose: async (_conn, reason) => {
      updateSession(id, {
        status: reason.pairingPending ? 'pairing' : reason.retry ? 'reconnecting' : 'closed',
        lastReason: reason.message,
        lastReasonName: reason.name,
        lastStatusCode: reason.statusCode || null,
        lastClosed: Date.now(),
      });
    },
    onStop: async (_conn, reason) => {
      clearInterval(storeIntervals.get(id));
      storeIntervals.delete(id);
      writeStore();
      updateSession(id, { status: 'stopped', stopReason: String(reason || 'stopped'), stoppedAt: Date.now() });
    },
  });

  return child;
}

export default {
  startJadibot,
  stopJadibot,
  listJadibots,
  getJadibotRecipients,
  broadcastJadibot,
  getJadibotSession,
  deleteJadibotSession,
};
