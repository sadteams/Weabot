import {
  default as makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';

import { Boom } from '@hapi/boom';
import pino from 'pino';
import chalk from 'chalk';
import appLogger from './logger.js';
import NodeCache from 'node-cache';
import path from 'path';
import fs from 'fs';
import { promises as fsp } from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';

import { bindConnMethods } from './serialize.js';
import { ensureDir } from './helper.js';
import { syncLidFromContact, syncLidFromGroupMetadata, syncLidFromParticipant } from './lid.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sessionRoot = path.join(rootDir, 'session');
const tmpFolder = path.join(rootDir, 'tmp');
const jadibotRoot = path.join(sessionRoot, 'jadibot');

const socketLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'fatal' });
const conns = new Map();
let mainConn = null;
let mainStore = null;
let latestVersion = null;
let latestVersionCheckedAt = 0;

export const disconnectReasonMessages = {
  [DisconnectReason.badSession]: {
    name: 'badSession',
    message: 'Session rusak atau tidak valid. Hapus folder session lalu login ulang.',
    retry: false,
  },
  [DisconnectReason.connectionClosed]: {
    name: 'connectionClosed',
    message: 'Koneksi tertutup dari WhatsApp/server.',
    retry: true,
  },
  [DisconnectReason.connectionLost]: {
    name: 'connectionLost/timedOut',
    message: 'Koneksi jaringan hilang atau timeout.',
    retry: true,
  },
  [DisconnectReason.connectionReplaced]: {
    name: 'connectionReplaced',
    message: 'Session dipakai di proses/perangkat lain.',
    retry: false,
  },
  [DisconnectReason.forbidden]: {
    name: 'forbidden',
    message: 'Akses ditolak oleh WhatsApp.',
    retry: false,
  },
  [DisconnectReason.loggedOut]: {
    name: 'loggedOut',
    message: 'Akun logout dari WhatsApp Web. Hapus folder session lalu login ulang.',
    retry: false,
  },
  [DisconnectReason.multideviceMismatch]: {
    name: 'multideviceMismatch',
    message: 'Akun/perangkat tidak kompatibel dengan multi-device.',
    retry: false,
  },
  [DisconnectReason.restartRequired]: {
    name: 'restartRequired',
    message: 'WhatsApp meminta socket dibuat ulang.',
    retry: true,
  },
  [DisconnectReason.timedOut]: {
    name: 'connectionLost/timedOut',
    message: 'Koneksi jaringan hilang atau timeout.',
    retry: true,
  },
  [DisconnectReason.unavailableService]: {
    name: 'unavailableService',
    message: 'Layanan WhatsApp sementara tidak tersedia.',
    retry: true,
  },
};

function question(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(text, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function sanitizePhoneNumber(phone) {
  const clean = String(phone || '').replace(/[^0-9]/g, '');
  if (clean.startsWith('08')) return `62${clean.slice(1)}`;
  return clean;
}

function getLoginMode(options = {}) {
  if (options.loginMode === 'qr' || options.loginMode === 'pairing') return options.loginMode;
  if (global.opts?.qr) return 'qr';
  if (global.opts?.pairing) return 'pairing';
  if (global.opts?.pairing === false) return 'qr';
  return global.isPairing ? 'pairing' : 'qr';
}

function getDisconnectInfo(error) {
  const payload = error?.output?.payload || {};
  const message = String(error?.message || payload.message || payload.error || error || 'Reason tidak dikenal.');
  let statusCode = error?.output?.statusCode
    || payload.statusCode
    || error?.statusCode
    || error?.data?.statusCode;

  if (!statusCode) {
    if (/logged\s*out|logout|401/i.test(message)) statusCode = DisconnectReason.loggedOut;
    else if (/bad\s*session/i.test(message)) statusCode = DisconnectReason.badSession;
    else if (/connection\s*replaced|conflict/i.test(message)) statusCode = DisconnectReason.connectionReplaced;
    else if (/restart\s*required/i.test(message)) statusCode = DisconnectReason.restartRequired;
    else if (/timed\s*out|timeout/i.test(message)) statusCode = DisconnectReason.timedOut;
  }

  const info = disconnectReasonMessages[statusCode] || {
    name: 'unknown',
    message,
    retry: true,
  };

  return {
    statusCode,
    name: info.name,
    message: info.message || message,
    retry: info.retry,
    rawMessage: message,
  };
}

function resolveMainSessionDir() {
  const modern = path.join(sessionRoot, 'main');
  const legacyCreds = path.join(sessionRoot, 'creds.json');
  const modernCreds = path.join(modern, 'creds.json');
  if (fs.existsSync(modernCreds)) return modern;
  if (fs.existsSync(legacyCreds)) return sessionRoot;
  return modern;
}

async function closeSocket(ws, timeout = 1500) {
  if (!ws || ws.isClosed) return;
  try {
    await Promise.race([
      ws.close(),
      new Promise((resolve) => setTimeout(resolve, timeout)),
    ]);
  } catch {}
}

async function removeAuthFolder(folder) {
  try {
    await fsp.rm(folder, { recursive: true, force: true });
  } catch (error) {
    appLogger.warn('socket', 'failed to remove auth folder', error.message);
  }
}

async function waitForSocketOpen(conn, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (conn.ws?.isOpen) return true;
    if (conn.ws?.isClosed || conn.ws?.isClosing || conn.status === 'close') return false;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return !!conn.ws?.isOpen;
}

function makeDebouncedSave(saveCreds, wait = 800) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => saveCreds().catch((error) => {
      appLogger.warn('socket', 'failed to save creds', error.message);
    }), wait);
  };
}

async function getBaileysVersion() {
  const now = Date.now();
  if (latestVersion && now - latestVersionCheckedAt < 60 * 60 * 1000) return latestVersion;
  const result = await fetchLatestBaileysVersion();
  latestVersion = result;
  latestVersionCheckedAt = now;
  return result;
}

function buildSocketConfig({ state, store, loginMode, groupCache, msgRetryCounterCache, userDevicesCache, mediaCache, callOfferCache, markOnlineOnConnect, extraConfig }) {
  return {
    logger: socketLogger,
    printQRInTerminal: loginMode === 'qr',
    browser: Browsers.ubuntu('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, socketLogger),
    },
    msgRetryCounterCache,
    userDevicesCache,
    mediaCache,
    callOfferCache,
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: true,
    defaultQueryTimeoutMs: undefined,
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    retryRequestDelayMs: 500,
    maxMsgRetryCount: 5,
    enableAutoSessionRecreation: true,
    enableRecentMessageCache: true,
    syncFullHistory: true,
    cachedGroupMetadata: async (jid) => groupCache.get(jid) || store?.groupMetadata?.[jid],
    getMessage: async (key) => {
      const msg = await store?.loadMessage?.(key.remoteJid, key.id);
      return msg?.message || { conversation: 'Bot' };
    },
    ...extraConfig,
  };
}

function isConnectionClosedError(error) {
  const statusCode = error?.output?.statusCode || error?.output?.payload?.statusCode;
  return statusCode === DisconnectReason.connectionClosed || /connection closed/i.test(String(error?.message || error));
}

function bindSocketSafety(conn) {
  const rawSendMessage = conn.sendMessage.bind(conn);
  conn.isSocketOpen = () => conn.status === 'open' && !!conn.ws?.isOpen;
  conn.safeSendMessage = async (...args) => {
    if (!conn.isSocketOpen()) return null;
    try {
      return await rawSendMessage(...args);
    } catch (error) {
      if (isConnectionClosedError(error)) {
        conn.status = conn.status === 'open' ? 'reconnecting' : conn.status;
        return null;
      }
      throw error;
    }
  };
  conn.sendMessage = async (...args) => {
    if (conn.isChild && !conn.isSocketOpen()) {
      const error = new Boom('Jadibot socket is reconnecting', { statusCode: DisconnectReason.connectionClosed });
      error.isTransientSocket = true;
      throw error;
    }
    try {
      return await rawSendMessage(...args);
    } catch (error) {
      if (conn.isChild && isConnectionClosedError(error)) {
        error.isTransientSocket = true;
        conn.status = conn.status === 'open' ? 'reconnecting' : conn.status;
      }
      throw error;
    }
  };
}

function bindCommonEvents(conn, store, groupCache) {
    // ===== AUTO READ PESAN =====
conn.ev.on('messages.upsert', async ({ messages, type }) => {
    await global.db.write()
    if (type!== 'notify') return;
    const m = messages[0];
    if (!m.message || m.key.fromMe) return; // skip pesan dari diri sendiri

    // Tandai sudah dibaca
    await conn.readMessages([m.key]);

    const chat = m.key.remoteJid;
    const sender = m.key.participant || m.key.remoteJid;

    if (chat === 'status@broadcast') {
        console.log(chalk.green(`[AUTO READ STATUS] Dari: ${sender}`));
    }
});
  conn.ev.on('contacts.upsert', (updates) => {
    for (const contact of updates || []) {
      syncLidFromContact(contact, 'contacts.upsert');
      const id = jidNormalizedUser(contact.id);
      if (store?.contacts && id) store.contacts[id] = { ...(store.contacts[id] || {}), ...contact, isContact: true };
    }
  });

  conn.ev.on('groups.update', (updates) => {
    for (const update of updates || []) {
      syncLidFromGroupMetadata(update, 'groups.update');
      if (!update.id) continue;
      if (store?.groupMetadata?.[update.id]) {
        store.groupMetadata[update.id] = { ...(store.groupMetadata[update.id] || {}), ...update };
      }
      const cached = groupCache.get(update.id) || {};
      groupCache.set(update.id, { ...cached, ...update });
    }
  });
}

async function requestPairingCode(conn, phone, options = {}) {
  if (conn.authState.creds.registered) return null;
  const cleanPhone = sanitizePhoneNumber(phone || options.phone);
  if (!cleanPhone) throw new Error('Nomor WA tidak valid untuk pairing code.');

  const isOpen = await waitForSocketOpen(conn, options.pairingWaitTimeout || 20_000);
  if (!isOpen) throw new Error('Socket belum siap untuk pairing code. Coba ulangi setelah koneksi stabil.');

  const requestDelay = Number(options.pairingRequestDelay ?? 1_200);
  if (requestDelay > 0) await new Promise((resolve) => setTimeout(resolve, requestDelay));

  let lastError;
  const attempts = Number(options.pairingAttempts || 3);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const code = await conn.requestPairingCode(cleanPhone);
      if (typeof options.onPairingCode === 'function') await options.onPairingCode(code, cleanPhone, conn);
      return code;
    } catch (error) {
      lastError = error;
      if (!isConnectionClosedError(error) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

function printLoginInfo({ id, loginMode, isChild }) {
  if (isChild) return;
  console.log('\n' + chalk.cyan.bold('=============================='));
  console.log(chalk.yellow.bold(`  ${global.namebot || 'Bot'}`));
  console.log(chalk.cyan.bold('==============================\n'));
  console.log(chalk.gray(`Socket: ${id}`));
  console.log(chalk.gray(`Mode login: ${loginMode === 'pairing' ? 'Pairing Code' : 'QR Terminal'}\n`));
}

async function handleConnectionUpdate(conn, update, options) {
  const { connection, lastDisconnect, isNewLogin } = update;
  const id = conn.id;

  if (isNewLogin) conn.isInit = true;
  if (connection === 'open') {
    conn.status = 'open';
    conn.reconnectAttempt = 0;
    conn.pairingCodeIssued = false;
    conn.pairingCloseNotified = false;
    if (!conn.isChild) global.stopped = connection;
    appLogger.success(conn.isChild ? 'jadibot' : 'socket', `${id} connected`, JSON.stringify(conn.user || {}));
    if (typeof options.onOpen === 'function') await options.onOpen(conn, update);
    return;
  }

  if (connection !== 'close') return;

  conn.status = 'reconnecting';
  const reason = getDisconnectInfo(lastDisconnect?.error);
  const pairingPending = conn.loginMode === 'pairing'
    && !conn.authState?.creds?.registered
    && (conn.pairingCodeIssued || !!conn.authState?.creds?.pairingCode);
  reason.pairingPending = pairingPending;
  if (pairingPending && reason.statusCode === DisconnectReason.loggedOut) {
    if (!conn.pairingCloseNotified) {
      conn.pairingCloseNotified = true;
      appLogger.warn(conn.isChild ? 'jadibot' : 'socket', `${id} pairing pending`, 'kode sudah dikirim, tunggu konfirmasi dari WhatsApp');
    }
  } else {
    appLogger.error(conn.isChild ? 'jadibot' : 'socket', `${id} closed`, `reason ${reason.statusCode || '-'} (${reason.name}): ${reason.message}`);
  }
  if (typeof options.onClose === 'function') await options.onClose(conn, reason, update);
  if (reason.statusCode === DisconnectReason.loggedOut && pairingPending) {
    conn.status = 'pairing';
    const maxPairingReconnect = options.maxPairingReconnect ?? 1;
    if (!conn.pairingReconnectScheduled && conn.pairingReconnects < maxPairingReconnect) {
      conn.pairingReconnectScheduled = true;
      conn.pairingReconnects += 1;
      const reconnectDelay = options.pairingReconnectDelay || 1_500;
      appLogger.warn(conn.isChild ? 'jadibot' : 'socket', `${id} pairing reconnect`, `menjaga socket pairing dalam ${reconnectDelay}ms`);
      setTimeout(() => reload(conn, { ...options, skipPairingRequest: true }).catch((error) => {
        appLogger.error(conn.isChild ? 'jadibot' : 'socket', `${id} pairing reconnect error`, error.stack || error.message);
      }), reconnectDelay);
    }
    return;
  }

  if (!reason.retry || reason.statusCode === DisconnectReason.loggedOut) {
    conn.status = 'close';
    const reasonText = `reason ${reason.statusCode || '-'} (${reason.name}): ${reason.message}`;
    appLogger.error(conn.isChild ? 'jadibot' : 'socket', `${id} fatal disconnect`, reasonText);

    const shouldClearAuth = reason.statusCode === DisconnectReason.loggedOut
      || reason.statusCode === DisconnectReason.badSession;
    await stop(id, reasonText);
    if (shouldClearAuth) {
      appLogger.warn(conn.isChild ? 'jadibot' : 'socket', `${id} clearing auth session`, conn.sessionDir);
      await removeAuthFolder(conn.sessionDir);
    }
    if (!conn.isChild) process.exit(0);
    return;
  }

  if (options.shouldReconnect === false) return;

  conn.reconnectAttempt = (conn.reconnectAttempt || 0) + 1;
  const maxReconnect = options.maxReconnect ?? (conn.isChild ? 8 : Infinity);
  if (conn.reconnectAttempt > maxReconnect) {
    appLogger.error(conn.isChild ? 'jadibot' : 'socket', `${id} reconnect stopped`, 'max reconnect reached');
    conn.status = 'close';
    await stop(id, 'max reconnect reached');
    return;
  }

  const reconnectDelay = Math.min(60_000, 3_000 * conn.reconnectAttempt);
  appLogger.warn(conn.isChild ? 'jadibot' : 'socket', `${id} reconnecting`, `in ${reconnectDelay}ms`);
  setTimeout(() => reload(conn, options).catch((error) => {
    appLogger.error(conn.isChild ? 'jadibot' : 'socket', `${id} reconnect error`, error.stack || error.message);
  }), reconnectDelay);
}

export async function start(options = {}) {
  const id = String(options.id || (options.isChild ? Date.now() : 'main'));
  const isChild = !!options.isChild;
  const sessionDir = options.sessionDir || (isChild ? path.join(jadibotRoot, id) : resolveMainSessionDir());
  const store = options.store || global.store;
  const loginMode = getLoginMode(options);
  let phone = sanitizePhoneNumber(options.phone || (isChild ? '' : global.opts?.phone || global.pairingNumber));

  ensureDir(sessionDir);
  ensureDir(tmpFolder);

  const hadCredsFile = fs.existsSync(path.join(sessionDir, 'creds.json'));
  let { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  if (loginMode === 'pairing' && !state.creds.registered && hadCredsFile && !options.skipPairingRequest) {
    const staleReason = state.creds.pairingCode ? 'stale pairing auth' : 'stale unregistered auth';
    appLogger.warn(isChild ? 'jadibot' : 'socket', `${id} removing ${staleReason}`, sessionDir);
    await removeAuthFolder(sessionDir);
    ensureDir(sessionDir);
    ({ state, saveCreds } = await useMultiFileAuthState(sessionDir));
  }
  if (loginMode === 'pairing' && !state.creds.registered && !state.creds.pairingCode && !phone && !isChild) {
    phone = sanitizePhoneNumber(await question(chalk.green('Masukkan nomor WA (contoh: 62895xxx): ')));
  }
  if (phone && !options.phone) options.phone = phone;

  const { version, isLatest } = await getBaileysVersion();
  const groupCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 60 });
  const msgRetryCounterCache = new NodeCache({ stdTTL: 60 * 60, checkperiod: 10 * 60 });
  const userDevicesCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 60 });
  const mediaCache = new NodeCache({ stdTTL: 10 * 60, checkperiod: 60 });
  const callOfferCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 60 });

  appLogger.info(isChild ? 'jadibot' : 'socket', `${id} baileys ${version.join('.')}`, isLatest ? 'latest' : '');
  appLogger.info(isChild ? 'jadibot' : 'socket', `${id} login mode`, loginMode === 'pairing' ? 'pairing code' : 'QR');
  printLoginInfo({ id, loginMode, isChild });

  const conn = makeWASocket({
    version,
    ...buildSocketConfig({
      state,
      store,
      loginMode,
      groupCache,
      msgRetryCounterCache,
      userDevicesCache,
      mediaCache,
      callOfferCache,
      markOnlineOnConnect: true,
      syncFullHistory: true,
      extraConfig: options.socketConfig || {},
    }),
  });
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. TIMPA sendMessage
const oldSendMessage = conn.sendMessage.bind(conn);
conn.sendMessage = async (jid, message, options = {}) => {
    if (options.skipTyping) return oldSendMessage(jid, message, options);
    await conn.sendPresenceUpdate('composing', jid);
    await delay(1800 + Math.random() * 1200);
    await conn.sendPresenceUpdate('paused', jid);
    return oldSendMessage(jid, message, options);
};

// 2. TIMPA relayMessage
const oldRelayMessage = conn.relayMessage.bind(conn);
conn.relayMessage = async (jid, message, options = {}) => {
    if (options.skipTyping) return oldRelayMessage(jid, message, options);
    
    await conn.sendPresenceUpdate('composing', jid);
    await delay(1500); // relay biasanya lebih cepat
    await conn.sendPresenceUpdate('paused', jid);

    return oldRelayMessage(jid, message, options);
};
  conn.id = id;
  conn.isChild = isChild;
  conn.isInit = options.oldSocket?.isInit || false;
  conn.reconnectAttempt = options.oldSocket?.reconnectAttempt || 0;
  conn.sessionDir = sessionDir;
  conn.store = store;
  conn.loginMode = loginMode;
  conn.status = 'connecting';
  conn.createdAt = options.oldSocket?.createdAt || Date.now();
  conn.pairingStartedAt = options.oldSocket?.pairingStartedAt || null;
  conn.pairingCodeIssued = options.oldSocket?.pairingCodeIssued || !!state.creds.pairingCode;
  conn.pairingCloseNotified = options.oldSocket?.pairingCloseNotified || false;
  conn.pairingReconnects = options.oldSocket?.pairingReconnects || 0;
  conn.pairingReconnectScheduled = false;
  conn.onStop = options.onStop;
  conn.parentConn = options.parentConn || options.oldSocket?.parentConn || null;
  conn.startOptions = { ...options };
  delete conn.startOptions.oldSocket;

  store?.bind?.(conn.ev, { groupMetadata: conn.groupMetadata.bind(conn) });
  bindConnMethods(conn, store);
  bindSocketSafety(conn);
  bindCommonEvents(conn, store, groupCache);

  if (isChild) conns.set(id, conn);
  else {
    mainConn = conn;
    mainStore = store;
    global.conn = conn;
  }

  const saveCredsDebounced = makeDebouncedSave(saveCreds, options.credsSaveDelay || 800);
  let pairingRequested = false;

  conn.ev.on('creds.update', saveCredsDebounced);
  conn.ev.on('connection.update', async (update) => {
    try {
      if (loginMode === 'qr' && update.qr && typeof options.onQr === 'function') await options.onQr(update.qr, conn, update);
      if (loginMode === 'qr' && update.qr && !isChild) {
        appLogger.info('socket', 'QR received', 'scan QR yang muncul di terminal');
      }
      if (!options.skipPairingRequest && !state.creds.pairingCode && !pairingRequested && loginMode === 'pairing' && !state.creds.registered && (update.connection === 'connecting' || update.connection === 'open' || update.qr)) {
        pairingRequested = true;
        try {
          conn.pairingStartedAt = Date.now();
          const code = await requestPairingCode(conn, phone, options);
          if (code) {
            conn.pairingCodeIssued = true;
            conn.pairingCode = code;
            conn.pairingPhone = phone;
            await saveCreds();
          }
          if (!isChild && code) {
            const displayCode = String(code).match(/.{1,4}/g)?.join('-') || code;
            console.log(chalk.green.bold('Pairing code: ') + chalk.yellow.bold(displayCode));
            console.log(chalk.gray('Masukkan kode tanpa spasi saat WhatsApp meminta kode pairing.'));
          }
        } catch (error) {
          pairingRequested = false;
          appLogger.error(isChild ? 'jadibot' : 'socket', `${id} pairing failed`, error.message);
          if (typeof options.onPairingError === 'function') await options.onPairingError(error, conn);
        }
      }
      await handleConnectionUpdate(conn, update, options);
    } catch (error) {
      appLogger.error(isChild ? 'jadibot' : 'socket', `${id} connection update error`, error.stack || error.message);
    }
  });

  if (options.onMessagesUpsert) {
    conn.ev.on('messages.upsert', (update) => Promise.resolve(options.onMessagesUpsert.call(conn, update)).catch((error) => {
      appLogger.error(conn.isChild ? 'jadibot' : 'socket', `${id} messages.upsert error`, error.stack || error.message);
    }));
  }

  if (options.onParticipantsUpdate) {
    conn.ev.on('group-participants.update', (update) => {
      for (const participant of update.participants || []) syncLidFromParticipant(participant, 'group-participants.update');
      return Promise.resolve(options.onParticipantsUpdate.call(conn, update)).catch((error) => {
        appLogger.error(conn.isChild ? 'jadibot' : 'socket', `${id} participants.update error`, error.stack || error.message);
      });
    });
  }

  if (options.onGroupsUpdate) {
    conn.ev.on('groups.update', (update) => options.onGroupsUpdate.call(conn, update));
  }

  return conn;
}

export async function reload(conn, options = {}) {
  const old = typeof conn === 'string' ? (conns.get(conn) || (conn === 'main' ? mainConn : null)) : conn;
  if (!old) return null;
  try { old.ev?.removeAllListeners(); } catch {}
  await closeSocket(old.ws);
  return start({ ...(old.startOptions || {}), ...options, oldSocket: old });
}

export async function stop(idOrConn, reason = 'stopped') {
  const conn = typeof idOrConn === 'string' ? (conns.get(idOrConn) || (idOrConn === 'main' ? mainConn : null)) : idOrConn;
  if (!conn) return false;
  try { conn.ev?.removeAllListeners(); } catch {}
  await closeSocket(conn.ws);
  try { await conn.store?.writeToFile?.(); } catch {}

  if (conn.isChild) conns.delete(conn.id);
  else if (mainConn === conn) mainConn = null;

  if (typeof conn.onStop === 'function') await conn.onStop(conn, reason);
  appLogger.warn(conn.isChild ? 'jadibot' : 'socket', `${conn.id} stopped`, reason);
  return true;
}

export async function connect(options = {}) {
  const conn = await start({
    id: 'main',
    isChild: false,
    store: options.store || global.store,
    onMessagesUpsert: options.onMessagesUpsert,
    onParticipantsUpdate: options.onParticipantsUpdate,
    onGroupsUpdate: options.onGroupsUpdate,
    loginMode: options.loginMode,
    phone: options.phone,
    socketConfig: options.socketConfig,
    shouldReconnect: options.shouldReconnect,
  });
  conn.startOptions = {
    id: 'main',
    isChild: false,
    store: options.store || global.store,
    onMessagesUpsert: options.onMessagesUpsert,
    onParticipantsUpdate: options.onParticipantsUpdate,
    onGroupsUpdate: options.onGroupsUpdate,
    loginMode: options.loginMode,
    phone: options.phone,
    socketConfig: options.socketConfig,
    shouldReconnect: options.shouldReconnect,
  };
  return conn;
}

Object.assign(connect, {
  start,
  reload,
  stop,
  conns,
  disconnectReasonMessages,
  sessionRoot,
  jadibotRoot,
});

Object.defineProperties(connect, {
  conn: { get: () => mainConn },
  main: { get: () => mainConn },
  store: { get: () => mainStore || global.store },
});

export { conns, sessionRoot, jadibotRoot };
export default connect;
