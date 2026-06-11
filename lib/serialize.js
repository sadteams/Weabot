import {
  areJidsSameUser,
  downloadContentFromMessage,
  extractMessageContent,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  getContentType,
  proto,
} from '@whiskeysockets/baileys';
import { fileTypeFromBuffer } from 'file-type';
import fetch from 'node-fetch';
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import Crypto from 'crypto';

import { toAudio, toPTT, toVideo } from './converter.js';
import { delay, isLid } from './helper.js';
import { imageToWebp, videoToWebp, writeExif } from './sticker.js';
import {
  decodeJid,
  resolveJid,
  syncLidFromMessageKey,
  syncLidFromParticipant,
} from './lid.js';

const mediaTypes = new Set(['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']);
const tmp = tmpdir();

function randomFile(ext = '') {
  const name = Crypto.randomBytes(8).toString('hex');
  return path.join(tmp, ext ? `${name}.${ext}` : name);
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function isDataUri(value) {
  return /^data:.*?\/.*?;base64,/i.test(String(value || ''));
}

function pickMessageType(message) {
  if (!message) return undefined;
  return getContentType(message) || Object.keys(message).find((key) => key !== 'senderKeyDistributionMessage' && key !== 'messageContextInfo');
}

function unwrapMessage(message) {
  if (!message) return message;
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension) return unwrapMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage) return unwrapMessage(message.documentWithCaptionMessage.message);
  return message;
}

function textFromMessage(message, type) {
  const content = message?.[type] || {};
  return message?.conversation ||
    content.text ||
    content.caption ||
    content.selectedId ||
    content.singleSelectReply?.selectedRowId ||
    content.selectedButtonId ||
    content.nativeFlowResponseMessage?.paramsJson ||
    content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    '';
}

function normalizeMention(jid, store) {
  return resolveJid(jid, store) || decodeJid(jid);
}

function normalizeJid(jid, store) {
  return resolveJid(jid, store) || decodeJid(jid) || '';
}

async function streamToBuffer(stream) {
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
}

export async function getBuffer(source, options = {}) {
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof ArrayBuffer) return Buffer.from(source);
  if (ArrayBuffer.isView(source)) return Buffer.from(source.buffer);

  if (typeof source === 'string') {
    if (isDataUri(source)) return Buffer.from(source.split(',')[1], 'base64');
    if (isUrl(source)) {
      const response = await fetch(source, options.fetchOptions || {});
      if (!response.ok) throw new Error(`Fetch failed ${response.status} ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    }
    if (fs.existsSync(source)) return fsp.readFile(source);
    return Buffer.from(source);
  }

  if (source?.url) return getBuffer(source.url, options);
  if (source?.data) return getBuffer(source.data, options);

  throw new TypeError('Unsupported media source');
}

export async function getFile(source, saveToFile = false, options = {}) {
  const data = await getBuffer(source, options);
  const type = await fileTypeFromBuffer(data).catch(() => null) || {};
  const mime = options.mimetype || type.mime || 'application/octet-stream';
  const ext = options.ext || type.ext || (/json/i.test(mime) ? 'json' : 'bin');
  const filename = saveToFile ? (typeof saveToFile === 'string' ? saveToFile : randomFile(ext)) : null;
  if (filename) await fsp.writeFile(filename, data);
  return { data, mime, ext, filename, size: data.length };
}

export async function downloadMediaMessage(message, filename) {
  const msg = message.msg || message.message?.[message.mtype] || message.message;
  const type = (message.mediaType || message.mtype || '').replace(/Message$/i, '');
  if (!msg || !type) throw new Error('Bukan pesan media');
  const stream = await downloadContentFromMessage(msg, type);
  const buffer = await streamToBuffer(stream);
  if (!filename) return buffer;
  const file = await getFile(buffer, true);
  const target = filename.includes('.') ? filename : `${filename}.${file.ext}`;
  await fsp.writeFile(target, buffer);
  if (file.filename) await fsp.unlink(file.filename).catch(() => {});
  return target;
}

function setHiddenConn(target, conn) {
  if (!target) return target;
  Object.defineProperty(target, 'conn', {
    enumerable: false,
    configurable: true,
    writable: true,
    value: conn,
  });
  return target;
}

function buildQuoted(conn, m, quotedMessage, contextInfo, store) {
  const quoted = unwrapMessage(quotedMessage);
  const type = pickMessageType(quoted);
  const content = quoted?.[type] || {};
  const sender = normalizeJid(contextInfo.participant, store);
  const key = {
    remoteJid: m.chat,
    fromMe: areJidsSameUser(sender, conn.user?.id),
    id: contextInfo.stanzaId,
    participant: sender,
  };

  const q = {
    key,
    id: key.id,
    chat: key.remoteJid,
    isBaileys: key.id?.startsWith('BAE5') || key.id?.startsWith('3EB0') || false,
    sender,
    fromMe: key.fromMe,
    message: quoted,
    mtype: type,
    msg: content,
    body: textFromMessage(quoted, type),
    text: textFromMessage(quoted, type),
    mentionedJid: (content.contextInfo?.mentionedJid || []).map((jid) => normalizeMention(jid, store)),
    mediaType: mediaTypes.has(type) ? type : null,
    mediaMessage: mediaTypes.has(type),
  };
  setHiddenConn(q, conn);

  q.download = (file) => downloadMediaMessage(q, file);
  q.copy = () => proto.WebMessageInfo.fromObject(proto.WebMessageInfo.toObject({ key, message: quoted }));
  q.delete = () => conn.sendMessage(m.chat, { delete: key });
  q.forward = (jid, forceForward = false, options = {}) => conn.copyNForward(jid, q.copy(), forceForward, options);
  q.copyNForward = q.forward;
  q.reply = (text, options = {}) => conn.reply(m.chat, text, q, options);
  return q;
}

export function serializeM(conn, message, store = global.store, hasParent = false) {
  const m = smsg(conn, message, store);
  if (!m) return m;

  setHiddenConn(m, conn);
  if (m.quoted) {
    setHiddenConn(m.quoted, conn);
    if (!m.quoted.mediaMessage) delete m.quoted.download;
  }
  if (!m.mediaMessage) delete m.download;

  let protocolMessageKey;
  if (m.message && m.mtype === 'protocolMessage' && m.msg?.key) {
    protocolMessageKey = { ...m.msg.key };
    if (protocolMessageKey.remoteJid === 'status@broadcast') protocolMessageKey.remoteJid = m.chat;
    if (!protocolMessageKey.participant || protocolMessageKey.participant === 'status_me') protocolMessageKey.participant = m.sender;
    protocolMessageKey.fromMe = areJidsSameUser(protocolMessageKey.participant, conn.user?.id);
    if (!protocolMessageKey.fromMe && areJidsSameUser(protocolMessageKey.remoteJid, conn.user?.id)) protocolMessageKey.remoteJid = m.sender;
  }

  if (protocolMessageKey) {
    try {
      conn.ev?.emit?.('messages.delete', { keys: [protocolMessageKey] });
    } catch (error) {
      console.error(error);
    }
  }

  return m;
}

export function smsg(conn, message, store = global.store) {
  if (!message) return message;
  const rawKey = message.key || {};
  syncLidFromMessageKey(rawKey);

  const m = proto.WebMessageInfo.fromObject(message);
  if (rawKey.remoteJidAlt) m.key.remoteJidAlt = rawKey.remoteJidAlt;
  if (rawKey.participantAlt) m.key.participantAlt = rawKey.participantAlt;
  m.message = unwrapMessage(m.message);
  setHiddenConn(m, conn);
  m.id = m.key?.id || '';
  m.isBaileys = m.id.startsWith('BAE5') || m.id.startsWith('3EB0') || false;
  m.rawChat = decodeJid(rawKey.remoteJid || m.key?.remoteJid) || '';
  m.chatAlt = decodeJid(rawKey.remoteJidAlt || m.key?.remoteJidAlt) || '';
  m.fromMe = !!m.key?.fromMe;
  m.isGroup = m.rawChat.endsWith('@g.us');
  m.chat = m.isGroup ? m.rawChat : normalizeJid(m.chatAlt || m.rawChat, store);
  m.isPrivate = !m.isGroup;

  const senderSource = m.fromMe
    ? conn.user?.id
    : m.isGroup
      ? (rawKey.participantAlt || m.key.participantAlt || rawKey.participant || m.key.participant)
      : (rawKey.remoteJidAlt || m.key.remoteJidAlt || rawKey.remoteJid || m.key.remoteJid);
  m.sender = normalizeJid(senderSource, store);
  if (m.isPrivate && isLid(m.chat) && m.sender?.endsWith('@s.whatsapp.net')) m.chat = m.sender;

  m.mtype = pickMessageType(m.message) || '';
  m.msg = extractMessageContent(m.message) || m.message?.[m.mtype] || {};
  const content = m.message?.[m.mtype] || m.msg || {};
  m.body = textFromMessage(m.message, m.mtype);
  m.text = m.body;
  m.name = m.pushName || m.sender.split('@')[0];
  m.user = m.sender;
  m.jid = m.chat;
  m.participant = m.isGroup ? m.sender : null;
  m.mentionedJid = (content.contextInfo?.mentionedJid || []).map((jid) => normalizeMention(jid, store));
  m.mediaType = mediaTypes.has(m.mtype) ? m.mtype : null;
  m.mediaMessage = !!m.mediaType;
  m.download = (file) => downloadMediaMessage(m, file);

  const contextInfo = content.contextInfo || {};
  m.quoted = contextInfo.quotedMessage ? buildQuoted(conn, m, contextInfo.quotedMessage, contextInfo, store) : null;

  m.reply = (text, options = {}) => conn.reply(m.chat, text, m, options);
  m.react = (emoji) => conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
  m.delete = () => conn.sendMessage(m.chat, { delete: m.key });
  m.copy = () => proto.WebMessageInfo.fromObject(proto.WebMessageInfo.toObject(m));
  m.forward = (jid, forceForward = false, options = {}) => conn.copyNForward(jid, m, forceForward, options);
  m.copyNForward = m.forward;
  m.updateData = () => {
    m.data = {
      id: m.id,
      chat: m.chat,
      rawChat: m.rawChat,
      chatAlt: m.chatAlt,
      sender: m.sender,
      user: m.user,
      participant: m.participant,
      fromMe: m.fromMe,
      isGroup: m.isGroup,
      isPrivate: m.isPrivate,
      name: m.name,
      type: m.mtype,
      mtype: m.mtype,
      text: m.text,
      body: m.body,
      mediaType: m.mediaType,
      mediaMessage: m.mediaMessage,
      mentionedJid: m.mentionedJid,
      prefix: m.prefix || '',
      command: m.command || '',
      plugin: m.plugin || '',
      isCommand: !!m.isCommand,
    };
    return m.data;
  };
  m.updateData();

  return m;
}

function normalizeContacts(contacts) {
  return (Array.isArray(contacts) ? contacts : [contacts]).map((contact) => {
    if (typeof contact === 'string') contact = { number: contact };
    const number = String(contact.number || contact.jid || '').replace(/[^0-9]/g, '');
    const name = contact.name || number;
    return {
      displayName: name,
      vcard: [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:;${name};;;`,
        `FN:${name}`,
        `item1.TEL;waid=${number}:+${number}`,
        'item1.X-ABLabel:Ponsel',
        'END:VCARD',
      ].join('\n'),
    };
  });
}

async function toStickerBuffer(data, mime, ext, metadata = {}) {
  if (metadata && Object.keys(metadata).length) return writeExif({ data, mimetype: mime, ext }, metadata);
  if (/webp/i.test(mime)) return data;
  if (/video/i.test(mime)) return videoToWebp({ data, mimetype: mime, ext });
  return imageToWebp({ data, mimetype: mime, ext });
}

function mediaMessagePayload(type, data, options = {}) {
  const caption = options.caption || '';
  if (type === 'image') return { image: data, caption, ...options };
  if (type === 'video') return { video: data, caption, ...options };
  if (type === 'audio') return { audio: data, mimetype: options.mimetype || 'audio/mpeg', ptt: !!options.ptt, ...options };
  if (type === 'sticker') return { sticker: data, ...options };
  return {
    document: data,
    mimetype: options.mimetype || 'application/octet-stream',
    fileName: options.fileName || options.filename || `file.${options.ext || 'bin'}`,
    caption,
    ...options,
  };
}

export function bindConnMethods(conn, store = global.store) {
  conn.decodeJid = decodeJid;
  conn.getJid = (jid) => resolveJid(jid, store);
  conn.resolveJid = conn.getJid;
  conn.serializeM = (message, hasParent = false) => serializeM(conn, message, store, hasParent);
  conn.getFile = getFile;
  conn.getBuffer = getBuffer;
  conn.downloadMediaMessage = downloadMediaMessage;
  conn.delay = delay;

  conn.getName = async (jid, withoutContact = false) => {
    jid = conn.getJid(jid);
    if (!jid) return '';
    if (jid.endsWith('@g.us')) {
      const cached = store?.groupMetadata?.[jid]?.subject;
      if (cached) return cached;
      try { return (await conn.groupMetadata(jid)).subject; }
      catch { return jid.split('@')[0]; }
    }
    const contact = store?.contacts?.[jid] || conn.chats?.[jid] || {};
    return (!withoutContact && (contact.name || contact.notify || contact.vname || contact.pushName)) || jid.split('@')[0];
  };

  conn.reply = async (jid, text, quoted, options = {}) => {
    if (Buffer.isBuffer(text) || text?.url || (typeof text === 'string' && (isUrl(text) || fs.existsSync(text)))) {
      return conn.sendFile(jid, text, options.fileName || '', options.caption || '', quoted, options);
    }
    return conn.sendMessage(jid, { text: String(text), mentions: options.mentions, ...options }, { quoted, ...options.options });
  };

  conn.sendText = (jid, text, quoted, options = {}) => conn.reply(jid, text, quoted, options);

  conn.sendFile = async (jid, source, fileName = '', caption = '', quoted, options = {}) => {
    const file = await getFile(source, false, options);
    let data = file.data;
    let mime = options.mimetype || file.mime;
    let ext = options.ext || file.ext;
    let type = 'document';

    if (options.asSticker || /webp/i.test(mime)) {
      data = options.asSticker ? await toStickerBuffer(data, mime, ext, options.sticker || {}) : data;
      type = 'sticker';
      mime = 'image/webp';
    } else if (options.asDocument) {
      type = 'document';
    } else if (/image/i.test(mime)) {
      type = 'image';
    } else if (/video/i.test(mime)) {
      type = 'video';
    } else if (/audio/i.test(mime)) {
      type = 'audio';
      if (options.ptt) {
        const converted = await toPTT(data, ext);
        data = converted.data;
        mime = 'audio/ogg; codecs=opus';
        ext = 'ogg';
      } else if (options.asAudio) {
        const converted = await toAudio(data, ext);
        data = converted.data;
        mime = 'audio/ogg; codecs=opus';
        ext = 'opus';
      }
    } else if (options.asVideo) {
      const converted = await toVideo(data, ext);
      data = converted.data;
      mime = 'video/mp4';
      ext = 'mp4';
      type = 'video';
    }

    const payload = mediaMessagePayload(type, data, {
      ...options,
      caption,
      mimetype: mime,
      fileName: fileName || options.fileName || `file.${ext}`,
      ext,
    });
    delete payload.asSticker;
    delete payload.asDocument;
    delete payload.asAudio;
    delete payload.asVideo;
    delete payload.sticker;
    delete payload.options;
    return conn.sendMessage(jid, payload, { quoted, ...options.options });
  };

  conn.sendMedia = conn.sendFile;
  conn.sendImage = (jid, source, caption = '', quoted, options = {}) => conn.sendFile(jid, source, options.fileName || 'image', caption, quoted, { ...options, mimetype: options.mimetype || 'image/jpeg' });
  conn.sendVideo = (jid, source, caption = '', quoted, options = {}) => conn.sendFile(jid, source, options.fileName || 'video', caption, quoted, { ...options, mimetype: options.mimetype || 'video/mp4' });
  conn.sendAudio = (jid, source, quoted, options = {}) => conn.sendFile(jid, source, options.fileName || 'audio', '', quoted, { ...options, mimetype: options.mimetype || 'audio/mpeg' });
  conn.sendPTT = (jid, source, quoted, options = {}) => conn.sendFile(jid, source, options.fileName || 'audio', '', quoted, { ...options, ptt: true });
  conn.sendDocument = (jid, source, mimetype, fileName, caption = '', quoted, options = {}) => conn.sendFile(jid, source, fileName, caption, quoted, { ...options, asDocument: true, mimetype });
  conn.sendSticker = (jid, source, quoted, options = {}) => conn.sendFile(jid, source, 'sticker.webp', '', quoted, { ...options, asSticker: true });
  conn.sendImageAsSticker = (jid, source, quoted, options = {}) => conn.sendFile(jid, source, 'sticker.webp', '', quoted, { ...options, asSticker: true });
  conn.sendVideoAsSticker = conn.sendImageAsSticker;

  conn.sendContact = (jid, contacts, quoted, options = {}) => {
    const list = normalizeContacts(contacts);
    return conn.sendMessage(jid, { contacts: { displayName: list[0]?.displayName || 'Contact', contacts: list }, ...options }, { quoted });
  };

  conn.sendButton = (jid, buttons, quoted, options = {}) => {
    const normalized = buttons.map(([text, id]) => ({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: text, id }),
    }));
    return conn.sendMessage(jid, { text: options.body || '', footer: options.footer || '', buttons: normalized, ...options }, { quoted });
  };

  conn.copyNForward = async (jid, message, forceForward = false, options = {}) => {
    const raw = message?.message ? message : message?.copy?.() || message;
    const content = generateForwardMessageContent(raw, forceForward);
    const type = getContentType(content);
    if (options.readViewOnce && content[type]?.viewOnce) content[type].viewOnce = false;
    const msg = generateWAMessageFromContent(jid, content, {
      ...options,
      userJid: conn.user?.id,
    });
    await conn.relayMessage(jid, msg.message, { messageId: msg.key.id, ...options });
    return msg;
  };

  conn.cMod = (jid, message, text = '', sender = conn.user?.id, options = {}) => {
    const copy = proto.WebMessageInfo.fromObject(proto.WebMessageInfo.toObject(message));
    const type = getContentType(copy.message);
    if (typeof copy.message[type] === 'string') copy.message[type] = text || copy.message[type];
    else if (copy.message[type]?.caption) copy.message[type].caption = text || copy.message[type].caption;
    else if (copy.message[type]?.text) copy.message[type].text = text || copy.message[type].text;
    copy.key.remoteJid = jid;
    copy.key.fromMe = areJidsSameUser(sender, conn.user?.id);
    copy.key.participant = sender;
    copy.message = { ...copy.message, ...options };
    return copy;
  };

  conn.pushMessage = async (messages) => {
    if (!Array.isArray(messages)) messages = [messages];
    conn.chats ||= {};
    for (const raw of messages) {
      if (!raw?.key?.remoteJid) continue;
      syncLidFromMessageKey(raw.key, 'push-message');
      if (raw.key?.participant && raw.key?.participantAlt) {
        syncLidFromParticipant({ id: raw.key.participant, phoneNumber: raw.key.participantAlt }, 'push-message');
      }

      const isGroup = raw.key.remoteJid.endsWith('@g.us');
      const remoteJid = isGroup ? raw.key.remoteJid : (raw.key.remoteJidAlt || raw.key.remoteJid);
      const rawJid = raw.key.fromMe ? conn.user?.id : (isGroup ? (raw.key.participantAlt || raw.key.participant) : remoteJid);
      const id = conn.getJid(rawJid);
      if (id && (raw.pushName || raw.verifiedName)) {
        const contact = {
          ...(store.contacts?.[id] || {}),
          id,
          name: raw.pushName || store.contacts?.[id]?.name,
          notify: raw.pushName || store.contacts?.[id]?.notify,
          vname: raw.verifiedName || store.contacts?.[id]?.vname,
        };
        if (store.contacts) store.contacts[id] = contact;
        if (store.chats) store.chats[id] = { ...(store.chats[id] || {}), ...contact, isContact: true };
        conn.chats[id] = { ...(conn.chats[id] || {}), id, name: contact.name, notify: contact.notify };
      }

      if (typeof store.upsertMessage === 'function') store.upsertMessage(remoteJid, raw);
      else {
        store.messages ||= {};
        store.messages[remoteJid] ||= {};
        store.messages[remoteJid][raw.key.id] = raw;
      }
    }
  };

  return conn;
}
