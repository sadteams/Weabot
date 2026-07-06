import {
  areJidsSameUser,
  downloadContentFromMessage,
  extractMessageContent,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
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
import { Jimp, JimpMime } from 'jimp';
import { createRequire } from 'module';

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
const require = createRequire(import.meta.url);
let messageBuilder;

function getMessageBuilder() {
  if (messageBuilder !== undefined) return messageBuilder;
  try {
    const entry = require.resolve('baileys-mbuilder');
    const packageDir = path.dirname(path.dirname(entry));
    messageBuilder = require(path.join(packageDir, 'script', 'MessageBuilder.js'));
  } catch {
    messageBuilder = null;
  }
  return messageBuilder;
}

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

function formatBytes(bytes = 0) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = Number(bytes) || 0;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return size.toFixed(size >= 10 || unit === 0 ? 0 : 2) + ' ' + units[unit];
}

async function getFreeSpace(target = tmp) {
  if (typeof fsp.statfs !== 'function') return Infinity;
  try {
    const stat = await fsp.statfs(target);
    return Number(stat.bavail || stat.bfree || 0) * Number(stat.bsize || 0);
  } catch {
    return Infinity;
  }
}

async function getRemoteFileSize(url, options = {}) {
  if (!isUrl(url)) return null;
  try {
    const response = await fetch(url, { method: 'HEAD', headers: options.headers || {}, redirect: 'follow', signal: options.signal });
    const length = response.headers.get('content-length');
    return length ? Number(length) : null;
  } catch {
    return null;
  }
}

async function getHttpReadable(url, options = {}) {
  const response = await fetch(url, {
    method: 'GET',
    headers: options.headers || {},
    redirect: 'follow',
    signal: options.signal,
  });
  if (!response.ok) throw new Error('Fetch failed ' + response.status + ' ' + response.statusText);
  return response.body;
}

function isNoSpaceError(error) {
  return error?.code === 'ENOSPC' || /ENOSPC|no space left on device/i.test(String(error?.message || error));
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

function parseNativeFlowId(paramsJson) {
  if (!paramsJson) return '';
  try {
    const parsed = typeof paramsJson === 'string' ? JSON.parse(paramsJson) : paramsJson;
    return parsed?.id || parsed?.selectedId || parsed?.button_id || parsed?.rowId || '';
  } catch {
    return '';
  }
}

function buttonResponseId(message = {}, type = '') {
  const content = message?.[type] || {};
  return message?.buttonsResponseMessage?.selectedButtonId ||
    message?.templateButtonReplyMessage?.selectedId ||
    message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    parseNativeFlowId(message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) ||
    parseNativeFlowId(message?.nativeFlowResponseMessage?.paramsJson) ||
    content.selectedId ||
    content.selectedButtonId ||
    content.singleSelectReply?.selectedRowId ||
    parseNativeFlowId(content.nativeFlowResponseMessage?.paramsJson) ||
    parseNativeFlowId(content.paramsJson) ||
    '';
}

function textFromMessage(message, type) {
  const content = message?.[type] || {};
  const responseId = buttonResponseId(message, type);
  return responseId ||
    message?.conversation ||
    content.text ||
    content.caption ||
    content.selectedDisplayText ||
    content.title ||
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

export async function resizeImage(source, width = 300, height = 300) {
  const input = Buffer.isBuffer(source) ? source : await getBuffer(source);
  const image = await Jimp.read(input);
  image.resize({ w: Number(width) || 300, h: Number(height) || 300 });
  return image.getBuffer(JimpMime.jpeg);
}

function normalizeThumbnail(source) {
  if (!source) return null;
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof ArrayBuffer) return Buffer.from(source);
  if (ArrayBuffer.isView(source)) return Buffer.from(source.buffer);
  if (typeof source === 'string') {
    if (isDataUri(source)) return Buffer.from(source.split(',')[1], 'base64');
    if (!isUrl(source) && !fs.existsSync(source)) {
      try { return Buffer.from(source, 'base64'); } catch { return null; }
    }
  }
  return null;
}

async function getFile(source, saveToFile = false, options = {}) {
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
    buttonId: buttonResponseId(quoted, type),
    isButtonResponse: !!buttonResponseId(quoted, type),
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
  m.buttonId = buttonResponseId(m.message, m.mtype);
  m.isButtonResponse = !!m.buttonId || /^(buttonsResponseMessage|templateButtonReplyMessage|listResponseMessage|interactiveResponseMessage|nativeFlowResponseMessage)$/i.test(m.mtype);
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

const INTERACTIVE_NODES = [{
  tag: 'biz',
  attrs: {},
  content: [{
    tag: 'interactive',
    attrs: { type: 'native_flow', v: '1' },
    content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
  }],
}];

function normalizeButton(button, index = 0) {
  if (Array.isArray(button)) {
    const [text, id, extra = {}] = button;
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: String(text || id || 'Button ' + (index + 1)),
        id: String(id || text || ''),
        ...(extra && typeof extra === 'object' ? extra : {}),
      }),
    };
  }

  const item = button && typeof button === 'object' ? button : { text: String(button || '') };
  const text = item.text || item.title || item.displayText || item.display_text || item.id || 'Button ' + (index + 1);
  const id = item.id || item.buttonId || item.rowId || item.command || item.text || text;

  if (item.sections || item.rows) {
    return {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: text,
        sections: normalizeSections(item.sections || [{ title: item.title || text, rows: item.rows || [] }]),
      }),
    };
  }
  if (item.url) {
    return {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: text,
        url: item.url,
        merchant_url: item.url,
        webview_presentation: item.useWebview === false ? undefined : 'full',
      }),
    };
  }
  if (item.call || item.phoneNumber) {
    return {
      name: 'cta_call',
      buttonParamsJson: JSON.stringify({ display_text: text, phone_number: String(item.call || item.phoneNumber) }),
    };
  }
  if (item.copy || item.copyCode) {
    return {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({ display_text: text, copy_code: String(item.copy || item.copyCode) }),
    };
  }
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: text, id }),
  };
}

function normalizeButtons(buttons = []) {
  return (Array.isArray(buttons) ? buttons : [buttons]).filter(Boolean).map(normalizeButton);
}

function normalizeSections(sections = []) {
  return (Array.isArray(sections) ? sections : [sections]).filter(Boolean).map((section, sectionIndex) => ({
    title: section.title || 'Section ' + (sectionIndex + 1),
    highlight_label: section.highlight_label || section.highlightLabel || undefined,
    rows: (section.rows || []).filter(Boolean).map((row, rowIndex) => {
      if (Array.isArray(row)) {
        const [title, id, description = '', header = ''] = row;
        return { title: String(title || id || 'Menu ' + (rowIndex + 1)), id: String(id || title || ''), description: String(description || ''), header: String(header || '') };
      }
      return {
        header: row.header || '',
        title: row.title || row.text || row.id || 'Menu ' + (rowIndex + 1),
        description: row.description || row.desc || '',
        id: row.id || row.rowId || row.command || row.title || row.text || '',
      };
    }),
  }));
}

async function relayInteractive(conn, jid, interactiveMessage, quoted, options = {}) {
  const msg = generateWAMessageFromContent(jid, { interactiveMessage }, {
    userJid: conn.user?.id,
    quoted,
    ...options,
  });
  await conn.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    additionalNodes: options.additionalNodes || INTERACTIVE_NODES,
  });
  return msg;
}

function cleanButtonOptions(options = {}) {
  const copy = { ...options };
  delete copy.body;
  delete copy.text;
  delete copy.caption;
  delete copy.footer;
  delete copy.buttons;
  delete copy.button;
  delete copy.sections;
  delete copy.options;
  delete copy.additionalNodes;
  delete copy.header;
  delete copy.title;
  delete copy.image;
  delete copy.video;
  delete copy.document;
  delete copy.buffer;
  delete copy.thumbnail;
  return copy;
}

async function buttonMediaPayload(buffer, text = '', options = {}) {
  const source = buffer || options.buffer || options.image || options.video || options.document;
  if (!source) return { text };

  if (options.image) return { image: typeof options.image === 'string' && isUrl(options.image) ? { url: options.image } : options.image, caption: text, mimetype: options.mimetype };
  if (options.video) return { video: typeof options.video === 'string' && isUrl(options.video) ? { url: options.video } : options.video, caption: text, mimetype: options.mimetype || 'video/mp4' };
  if (options.document) {
    return {
      document: typeof options.document === 'string' && isUrl(options.document) ? { url: options.document } : options.document,
      caption: text,
      mimetype: options.mimetype || 'application/octet-stream',
      fileName: options.fileName || options.filename || 'document',
    };
  }

  const file = await getFile(source, false, options);
  if (!options.asDocument && /image/i.test(file.mime)) return { image: file.data, caption: text, mimetype: file.mime };
  if (!options.asDocument && /video/i.test(file.mime)) return { video: file.data, caption: text, mimetype: file.mime };
  return {
    document: file.data,
    caption: text,
    mimetype: options.mimetype || file.mime,
    fileName: options.fileName || options.filename || ('file.' + file.ext),
  };
}

function buttonLabel(item, index = 0) {
  if (Array.isArray(item)) return String(item[0] || item[1] || 'Button ' + (index + 1));
  return String(item?.text || item?.title || item?.displayText || item?.display_text || item?.id || 'Button ' + (index + 1));
}

function buttonId(item, fallback = '') {
  if (Array.isArray(item)) return String(item[1] || item[0] || fallback);
  return String(item?.id || item?.buttonId || item?.rowId || item?.command || item?.text || fallback);
}

function applyMBuilderButton(builder, item, index = 0) {
  if (!item) return builder;
  const extra = Array.isArray(item) && item[2] && typeof item[2] === 'object' ? item[2] : {};
  const label = buttonLabel(item, index);
  const id = buttonId(item, label);
  const data = Array.isArray(item) ? { text: label, id, ...extra } : item;

  if (data.sections || data.rows) {
    const sections = normalizeSections(data.sections || [{ title: data.title || label, rows: data.rows || [] }]);
    builder.addSelection(label, data.options || {});
    for (const section of sections) {
      builder.makeSection(section.title || '', section.highlight_label || '');
      for (const row of section.rows || []) {
        builder.makeRow(row.header || '', row.title || row.id || '', row.description || '', row.id || row.title || '');
      }
    }
    return builder;
  }
  if (data.url) return builder.addUrl(label, String(data.url), !!data.webview_interaction, data.options || {});
  if (data.call || data.phoneNumber) {
    return builder.addButton('cta_call', { display_text: label, phone_number: String(data.call || data.phoneNumber) });
  }
  if (data.copy || data.copyCode) return builder.addCopy(label, String(data.copy || data.copyCode), data.options || {});
  if (data.location || data.sendLocation) return builder.addLocation(data.options || {});
  if (data.name && data.buttonParamsJson) return builder.addButton(data.name, data.buttonParamsJson);
  return builder.addReply(label, id, data.options || {});
}

function normalizeButtonV2(button, index = 0) {
  return {
    buttonId: buttonId(button, buttonLabel(button, index)),
    buttonText: { displayText: buttonLabel(button, index) },
    type: 1,
  };
}

async function relayButtonsMessage(conn, jid, text = '', footer = '', buffer = null, buttons = [], quoted, options = {}) {
  const list = (Array.isArray(buttons) ? buttons : [buttons]).filter(Boolean).map(normalizeButtonV2);
  if (!list.length) return conn.reply(jid, text, quoted, options);

  const contextInfo = {
    mentionedJid: [],
    groupMentions: [],
    statusAttributions: [],
    ...(options.contextInfo || {}),
  };
  const buttonsMessage = {
    locationMessage: {
      degreesLatitude: Number(options.latitude ?? options.degreesLatitude ?? 0),
      degreesLongitude: Number(options.longitude ?? options.degreesLongitude ?? 0),
      name: String(options.name || options.title || 'Buttons Message'),
      address: String(options.address || options.subtitle || 'Buttons Message'),
    },
    contentText: String(text || ''),
    footerText: String(footer || options.footer || ''),
    buttons: list,
    contextInfo,
    headerType: 6,
  };
  if (options.viewOnce != null) buttonsMessage.viewOnce = !!options.viewOnce;

  const thumbnailSource = options.jpegThumbnail || options.thumbnail || options.thumb || buffer || options.buffer;
  const directThumb = normalizeThumbnail(thumbnailSource);
  if (directThumb) buttonsMessage.locationMessage.jpegThumbnail = directThumb;
  else if (thumbnailSource) {
    try {
      buttonsMessage.locationMessage.jpegThumbnail = await resizeImage(thumbnailSource, options.thumbnailWidth || 100, options.thumbnailHeight || 100);
    } catch {}
  }

  if (options.useMediaHeader) {
    const mediaSource = buffer || options.buffer || options.image || options.video || options.document;
    if (mediaSource) {
      const mediaPayload = await buttonMediaPayload(mediaSource, '', options);
      const mediaContent = {};
      if (mediaPayload.image) {
        const prepared = await prepareWAMessageMedia({ image: mediaPayload.image }, { upload: conn.waUploadToServer });
        mediaContent.imageMessage = prepared.imageMessage;
        buttonsMessage.headerType = 4;
      } else if (mediaPayload.video) {
        const prepared = await prepareWAMessageMedia({ video: mediaPayload.video }, { upload: conn.waUploadToServer });
        mediaContent.videoMessage = prepared.videoMessage;
        buttonsMessage.headerType = 5;
      } else if (mediaPayload.document) {
        const prepared = await prepareWAMessageMedia({
          document: mediaPayload.document,
          mimetype: mediaPayload.mimetype || 'application/octet-stream',
          fileName: mediaPayload.fileName || 'document',
        }, { upload: conn.waUploadToServer });
        mediaContent.documentMessage = prepared.documentMessage;
        buttonsMessage.headerType = 3;
      }
      if (Object.keys(mediaContent).length) {
        delete buttonsMessage.locationMessage;
        Object.assign(buttonsMessage, mediaContent);
      }
    }
  }

  const msg = generateWAMessageFromContent(jid, { buttonsMessage }, {
    userJid: conn.user?.id,
    quoted,
    ...(options.generateOptions || options.options || {}),
  });
  await conn.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    additionalNodes: options.additionalNodes || INTERACTIVE_NODES,
    ...(options.relayOptions || {}),
  });
  return msg;
}

async function buildMBuilderButton(conn, text = '', footer = '', buffer = null, buttons = [], options = {}) {
  const MB = getMessageBuilder();
  if (!MB?.Button) return null;
  const builder = new MB.Button(conn);
  builder.setBody(String(text || ''));
  builder.setFooter(String(footer || options.footer || ''));
  if (options.title) builder.setTitle(String(options.title));
  if (options.subtitle) builder.setSubtitle(String(options.subtitle));
  if (options.contextInfo) builder.setContextInfo(options.contextInfo);
  if (options.params) builder.setParams(options.params);

  const media = await buttonMediaPayload(buffer, '', options);
  delete media.text;
  if (Object.keys(media).length) builder.setMedia(media);
  for (const [index, button] of (Array.isArray(buttons) ? buttons : [buttons]).filter(Boolean).entries()) {
    applyMBuilderButton(builder, button, index);
  }
  return builder;
}

function mediaUrlFromContent(content = {}) {
  const mediaKey = ['document', 'video', 'image', 'audio'].find((key) => content?.[key]?.url && isUrl(content[key].url));
  if (!mediaKey) return null;
  return { mediaKey, url: content[mediaKey].url };
}

function fallbackUploadText(url, size) {
  return [
    '*Upload media gagal atau dibatalkan agar bot tetap stabil.*',
    size ? 'Ukuran file: ' + formatBytes(size) : '',
    'Silakan unduh langsung dari link ini:',
    url,
  ].filter(Boolean).join('\n');
}

async function normalizeSendMessageMedia(content = {}, options = {}) {
  const found = mediaUrlFromContent(content);
  if (!found || content.__skipMediaUrlStream) return { content, options, media: null };

  const maxSize = Number(content.maxSize || options.maxSize || global.maxUploadSize || 95 * 1024 * 1024);
  const minFreeSpace = Number(content.minFreeSpace || options.minFreeSpace || global.minUploadFreeSpace || 300 * 1024 * 1024);
  const size = await getRemoteFileSize(found.url, { headers: options.headers || content.headers });
  const free = await getFreeSpace(tmp);
  const tooLarge = size && size > maxSize;
  const notEnoughSpace = Number.isFinite(free) && free < Math.max(minFreeSpace, (size || maxSize) * 1.2);

  if (tooLarge || notEnoughSpace) {
    return {
      content: { text: content.fallbackText || fallbackUploadText(found.url, size) },
      options,
      media: { ...found, size, skipped: true },
    };
  }

  const stream = await getHttpReadable(found.url, { headers: options.headers || content.headers });
  return {
    content: {
      ...content,
      [found.mediaKey]: { ...content[found.mediaKey], url: undefined, stream },
      __stream: stream,
    },
    options: {
      ...options,
      upload: options.upload || undefined,
      mediaUploadTimeoutMs: options.mediaUploadTimeoutMs || Number(global.mediaUploadTimeoutMs || 5 * 60 * 1000),
    },
    media: { ...found, size, stream },
  };
}

export function bindConnMethods(conn, store = global.store) {
  if (!conn.__sendMessageOriginal) {
    conn.__sendMessageOriginal = conn.sendMessage.bind(conn);
    conn.sendMessage = async (jid, content = {}, options = {}) => {
      const normalized = await normalizeSendMessageMedia(content, { ...options, upload: options.upload || conn.waUploadToServer });
      const stream = normalized.content.__stream;
      if (stream) delete normalized.content.__stream;
      try {
        return await conn.__sendMessageOriginal(jid, normalized.content, normalized.options);
      } catch (error) {
        if (stream?.destroy) stream.destroy();
        if (!isNoSpaceError(error) || !normalized.media?.url) throw error;
        return conn.__sendMessageOriginal(jid, {
          text: content.fallbackText || fallbackUploadText(normalized.media.url, normalized.media.size),
        }, options);
      }
    };
  }
  conn.decodeJid = decodeJid;
  conn.getJid = (jid) => resolveJid(jid, store);
  conn.resolveJid = conn.getJid;
  conn.serializeM = (message, hasParent = false) => serializeM(conn, message, store, hasParent);
  conn.getFile = getFile;
  conn.getBuffer = getBuffer;
  conn.downloadMediaMessage = downloadMediaMessage;
  conn.resize = resizeImage;
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

  conn.sendButton = async (jid, text = '', footer = '', buffer = null, buttons = [], quoted, options = {}) => {
    if (text && typeof text === 'object' && !Buffer.isBuffer(text) && !Array.isArray(text)) {
      const data = text;
      return conn.sendButton(
        jid,
        data.text || data.body || data.caption || '',
        data.footer || '',
        data.buffer || data.image || data.video || data.document || null,
        data.buttons || data.button || [],
        footer,
        data,
      );
    }
    if (Array.isArray(text)) {
      const legacyButtons = text;
      const legacyQuoted = footer;
      const legacyOptions = buffer && typeof buffer === 'object' && !Buffer.isBuffer(buffer) ? buffer : {};
      return conn.sendButton(jid, legacyOptions.text || legacyOptions.body || legacyOptions.caption || '', legacyOptions.footer || '', legacyOptions.buffer || null, legacyButtons, legacyQuoted, legacyOptions);
    }

    const normalized = buttons || options.buttons || options.button || [];
    return relayButtonsMessage(conn, jid, text, footer, buffer, normalized, quoted, options);
  };

  conn.sendButtons = conn.sendButton;
  conn.sendButtonText = conn.sendButton;
  conn.sendHydrated = conn.sendButton;
  conn.sendHydratedButton = conn.sendButton;

  conn.sendButtonList = async (jid, text = '', footer = '', buffer = null, sections = [], quoted, options = {}) => {
    if (text && typeof text === 'object' && !Buffer.isBuffer(text) && !Array.isArray(text)) {
      const data = text;
      return conn.sendButtonList(
        jid,
        data.text || data.body || data.caption || '',
        data.footer || '',
        data.buffer || data.image || data.video || data.document || null,
        data.sections || [],
        footer,
        data,
      );
    }
    if (Array.isArray(buffer) && !sections.length) {
      sections = buffer;
      buffer = null;
    }
    const title = options.title || options.buttonText || 'Pilih Menu';
    const listButton = { text: title, sections: normalizeSections(sections || options.sections || []) };
    try {
      const builder = await buildMBuilderButton(conn, text, footer, buffer, [listButton, ...(options.buttons || options.button || [])], options);
      if (builder) return builder.send(jid, { quoted, userJid: conn.user?.id, ...(options.relayOptions || options.options || {}) });
    } catch (error) {
      if (!options.silentBuilderError && global.logger?.warn) global.logger.warn('message builder list fallback', error?.message || error);
    }
    const nativeButtons = [normalizeButton(listButton), ...normalizeButtons(options.buttons || options.button || [])];
    const headerPayload = await buttonMediaPayload(buffer, '', options);
    const header = options.header || {};
    if (headerPayload.image) header.imageMessage = headerPayload.image;
    if (headerPayload.video) header.videoMessage = headerPayload.video;
    return relayInteractive(conn, jid, {
      header,
      body: { text: String(text || '') },
      footer: { text: String(footer || options.footer || '') },
      nativeFlowMessage: { buttons: nativeButtons },
      contextInfo: options.contextInfo || {},
    }, quoted, options);
  };

  conn.sendList = conn.sendButtonList;

  conn.sendInteractive = async (jid, text = '', footer = '', buffer = null, buttons = [], quoted, options = {}) => {
    if (text && typeof text === 'object' && !Buffer.isBuffer(text)) {
      const data = text;
      return conn.sendInteractive(jid, data.text || '', data.footer || '', data.buffer || data.image || data.video || data.document || null, data.buttons || data.button || [], footer, data);
    }
    const sections = options.sections || [];
    const nativeButtons = sections.length
      ? [{ name: 'single_select', buttonParamsJson: JSON.stringify({ title: options.title || 'Pilih Menu', sections: normalizeSections(sections) }) }, ...normalizeButtons(buttons)]
      : normalizeButtons(buttons);
    const headerPayload = await buttonMediaPayload(buffer, '', options);
    const header = options.header || {};
    if (headerPayload.image) header.imageMessage = headerPayload.image;
    if (headerPayload.video) header.videoMessage = headerPayload.video;
    return relayInteractive(conn, jid, {
      header,
      body: { text: String(text || '') },
      footer: { text: String(footer || options.footer || '') },
      nativeFlowMessage: { buttons: nativeButtons },
      contextInfo: options.contextInfo || {},
    }, quoted, options);
  };

  conn.sendButtonV2 = async (jid, text = '', footer = '', buttons = [], quoted, options = {}) => {
    const MB = getMessageBuilder();
    if (!MB?.ButtonV2) return conn.sendButton(jid, text, footer, options.buffer || null, buttons, quoted, options);
    const builder = new MB.ButtonV2(conn);
    builder.setBody(String(text || ''));
    builder.setFooter(String(footer || options.footer || ''));
    if (options.title) builder.setTitle(String(options.title));
    if (options.subtitle) builder.setSubtitle(String(options.subtitle));
    if (options.contextInfo) builder.setContextInfo(options.contextInfo);
    if (options.thumbnail) builder.setThumbnail(options.thumbnail);
    if (options.media) builder.setMedia(options.media);
    for (const [index, button] of (Array.isArray(buttons) ? buttons : [buttons]).filter(Boolean).entries()) {
      builder.addButton(buttonLabel(button, index), buttonId(button, buttonLabel(button, index)));
    }
    return builder.send(jid, { quoted, userJid: conn.user?.id, ...(options.relayOptions || options.options || {}) });
  };

  conn.sendCarousel = async (jid, cards = [], quoted, options = {}) => {
    const MB = getMessageBuilder();
    if (!MB?.Carousel || !MB?.Button) throw new Error('baileys-mbuilder Carousel is not available');
    const carousel = new MB.Carousel(conn);
    carousel.setBody(String(options.text || options.body || ''));
    carousel.setFooter(String(options.footer || ''));
    if (options.contextInfo) carousel.setContextInfo(options.contextInfo);

    const builtCards = [];
    for (const [index, card] of (Array.isArray(cards) ? cards : [cards]).filter(Boolean).entries()) {
      const item = Array.isArray(card) ? { image: card[0], title: card[1], text: card[2], buttons: card[3] || [] } : card;
      const button = new MB.Button(conn);
      button.setBody(String(item.text || item.body || item.description || ''));
      button.setFooter(String(item.footer || ''));
      button.setTitle(String(item.title || 'Card ' + (index + 1)));
      if (item.subtitle) button.setSubtitle(String(item.subtitle));
      if (item.image) button.setImage(item.image, { mimetype: item.mimetype });
      else if (item.video) button.setVideo(item.video, { mimetype: item.mimetype || 'video/mp4' });
      else if (item.document) button.setDocument(item.document, { mimetype: item.mimetype, fileName: item.fileName || item.filename });
      else if (item.buffer) {
        const media = await buttonMediaPayload(item.buffer, '', { ...options, mimetype: item.mimetype, fileName: item.fileName || item.filename });
        delete media.text;
        button.setMedia(media);
      }
      for (const [buttonIndex, child] of (Array.isArray(item.buttons) ? item.buttons : [item.buttons]).filter(Boolean).entries()) {
        applyMBuilderButton(button, child, buttonIndex);
      }
      builtCards.push(await button.toCard());
    }

    carousel.addCard(builtCards);
    return carousel.send(jid, { quoted, userJid: conn.user?.id, ...(options.relayOptions || options.options || {}) });
  };

  conn.sendAIRich = async (jid, text = '', quoted, options = {}) => {
    const MB = getMessageBuilder();
    if (!MB?.AIRich) return conn.reply(jid, text, quoted, options);
    const builder = new MB.AIRich(conn);
    if (options.contextInfo) builder.setContextInfo(options.contextInfo);
    const items = Array.isArray(text) ? text : [{ type: 'text', text }];
    for (const item of items) {
      if (typeof item === 'string') builder.addText(item, options);
      else if (item.type === 'code') builder.addCode(item.language || '', item.code || '');
      else if (item.type === 'table') builder.addTable(item.table || item.rows || [], item.options || options);
      else if (item.type === 'source') builder.addSource(item.sources || item.source || []);
      else if (item.type === 'section') builder.addSection(item.section || item.value || item);
      else if (item.type === 'submessage') builder.addSubmessage(item.submessage || item.value || item);
      else builder.addText(String(item.text || item.value || ''), item.options || options);
    }
    return builder.send(jid, { quoted, userJid: conn.user?.id, ...(options.relayOptions || options.options || {}) });
  };

  conn.sendAiRich = conn.sendAIRich;
  conn.aiRich = conn.sendAIRich;

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
