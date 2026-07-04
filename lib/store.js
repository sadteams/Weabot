import fs from 'fs';
import path from 'path';
import {
  proto,
  isJidBroadcast,
  isJidGroup,
  WAMessageStubType,
  updateMessageWithReceipt,
  updateMessageWithReaction,
} from '@whiskeysockets/baileys';

import { ensureDir, readJson, writeJson } from './helper.js';
import { decodeJid, syncLidFromContact, syncLidFromGroupMetadata, syncLidFromParticipant } from './lid.js';

const TIME_TO_DATA_STALE = 5 * 60 * 1000;
const MAX_MESSAGES_PER_CHAT = Number(process.env.STORE_MAX_MESSAGES || 1000);

function normalizeJid(jid) {
  return decodeJid(jid) || '';
}

function cleanMessage(message) {
  if (!message?.message) return message;
  delete message.message.messageContextInfo;
  delete message.message.senderKeyDistributionMessage;
  return message;
}

export function makeInMemoryStore(options = {}) {
  const file = options.file || null;
  const maxMessages = Number(options.maxMessages || MAX_MESSAGES_PER_CHAT);
  const chats = {};
  const messages = {};
  const contacts = chats;
  const groupMetadata = {};
  const state = { connection: 'close' };

  function ensureChat(jid, data = {}) {
    jid = normalizeJid(jid);
    if (!jid) return null;
    chats[jid] = { id: jid, ...(chats[jid] || {}), ...data };
    if (jid.endsWith('@g.us') && data.metadata) groupMetadata[jid] = data.metadata;
    return chats[jid];
  }

  function ensureMessageList(jid) {
    jid = normalizeJid(jid);
    if (!jid) return null;
    messages[jid] ||= [];
    return messages[jid];
  }

  function loadMessage(jid, id = null) {
    if (jid && !id) {
      id = jid;
      for (const list of Object.values(messages)) {
        const found = list.find((message) => message?.key?.id === id);
        if (found) return found;
      }
      return null;
    }
    jid = normalizeJid(jid);
    return messages[jid]?.find((message) => message?.key?.id === id) || null;
  }

  function upsertMessage(jid, message, type = 'append') {
    jid = normalizeJid(jid || message?.key?.remoteJid);
    if (!jid || isJidBroadcast(jid)) return null;
    const list = ensureMessageList(jid);
    if (!list) return null;

    const copy = cleanMessage(proto.WebMessageInfo.fromObject(message));
    const index = list.findIndex((item) => item?.key?.id === copy.key?.id);
    if (index >= 0) Object.assign(list[index], copy);
    else if (type === 'prepend') list.unshift(copy);
    else list.push(copy);

    if (list.length > maxMessages) list.splice(0, list.length - maxMessages);
    return copy;
  }

  async function fetchGroupMetadata(jid, groupMetadataFetcher) {
    jid = normalizeJid(jid);
    if (!isJidGroup(jid)) return null;
    const chat = ensureChat(jid, { isChats: true });
    const stale = !chat.metadata || Date.now() - (chat.lastfetch || 0) > TIME_TO_DATA_STALE;
    if (stale && typeof groupMetadataFetcher === 'function') {
      const metadata = await groupMetadataFetcher(jid).catch(() => null);
      if (metadata) {
        syncLidFromGroupMetadata(metadata, 'store-fetchGroupMetadata');
        chat.subject = metadata.subject;
        chat.metadata = metadata;
        chat.lastfetch = Date.now();
        groupMetadata[jid] = metadata;
      }
    }
    return chat.metadata || groupMetadata[jid] || null;
  }

  function fetchMessageReceipts(id) {
    return loadMessage(id)?.userReceipt || null;
  }

  async function fetchImageUrl(jid, profilePictureUrl) {
    jid = normalizeJid(jid);
    const chat = ensureChat(jid);
    if (!chat) return null;
    if (!chat.imgUrl && typeof profilePictureUrl === 'function') {
      chat.imgUrl = await profilePictureUrl(jid, 'image').catch(() => null);
    }
    return chat.imgUrl || null;
  }

  function getContact(jid) {
    return chats[normalizeJid(jid)] || null;
  }

  function bind(ev, opts = {}) {
    ev.on('connection.update', (update) => Object.assign(state, update));

    ev.on('messaging-history.set', ({ chats: historyChats = [], contacts: historyContacts = [], messages: historyMessages = [] }) => {
      for (const chat of historyChats) ensureChat(chat.id, { ...chat, isChats: true });
      for (const contact of historyContacts) {
        syncLidFromContact(contact, 'store-history-contact');
        ensureChat(contact.id, { ...contact, isContact: true });
      }
      for (const message of historyMessages) upsertMessage(message.key?.remoteJid, message, 'prepend');
    });

    ev.on('chats.set', ({ chats: setChats = [] }) => {
      for (const chat of setChats) ensureChat(chat.id, { ...chat, isChats: true });
    });

    ev.on('contacts.set', ({ contacts: setContacts = [] }) => {
      for (const contact of setContacts) {
        syncLidFromContact(contact, 'store-contacts.set');
        ensureChat(contact.id, { ...contact, isContact: true });
      }
    });

    ev.on('messages.set', ({ messages: setMessages = [] }) => {
      for (const message of setMessages) {
        const jid = normalizeJid(message.key?.remoteJid);
        if (!jid || isJidBroadcast(jid) || message.messageStubType === WAMessageStubType.CIPHERTEXT) continue;
        upsertMessage(jid, message, 'prepend');
      }
    });

    ev.on('contacts.upsert', (updates = []) => {
      for (const contact of updates) {
        syncLidFromContact(contact, 'store-contacts.upsert');
        ensureChat(contact.id, { ...contact, isContact: true });
      }
    });

    ev.on('contacts.update', (updates = []) => {
      for (const contact of updates) {
        syncLidFromContact(contact, 'store-contacts.update');
        ensureChat(contact.id, { ...contact, isContact: true });
      }
    });

    ev.on('chats.upsert', async (updates = []) => {
      await Promise.all(updates.map(async (chat) => {
        const id = normalizeJid(chat.id);
        if (!id || isJidBroadcast(id)) return;
        const data = ensureChat(id, { ...chat, isChats: true });
        if (isJidGroup(id) && !data.metadata) data.metadata = await fetchGroupMetadata(id, opts.groupMetadata);
      }));
    });

    ev.on('chats.update', (updates = []) => {
      for (const chat of updates) {
        const id = normalizeJid(chat.id);
        if (!id) continue;
        const current = ensureChat(id, { isChats: true });
        if (chat.unreadCount) chat.unreadCount += current.unreadCount || 0;
        Object.assign(current, chat, { id, isChats: true });
      }
    });

    ev.on('presence.update', (presence = {}) => {
      const id = normalizeJid(presence.id);
      if (!id) return;
      ensureChat(id, { ...presence, isContact: true });
    });

    ev.on('messages.upsert', ({ messages: newMessages = [], type = 'append' }) => {
      for (const message of newMessages) {
        const jid = normalizeJid(message.key?.remoteJid);
        if (!jid || isJidBroadcast(jid) || message.messageStubType === WAMessageStubType.CIPHERTEXT) continue;
        upsertMessage(jid, message, type === 'prepend' ? 'prepend' : 'append');
        if (type === 'notify') ensureChat(jid, {
          id: jid,
          conversationTimestamp: message.messageTimestamp,
          unreadCount: (chats[jid]?.unreadCount || 0) + 1,
          name: message.pushName || message.verifiedBizName || chats[jid]?.name,
          isChats: true,
        });
      }
    });

    ev.on('messages.update', (updates = []) => {
      for (const update of updates) {
        const jid = normalizeJid(update.key?.remoteJid);
        if (!jid || isJidBroadcast(jid)) continue;
        const msg = loadMessage(jid, update.key?.id);
        if (!msg || update.update?.messageStubType === WAMessageStubType.REVOKE) continue;
        Object.assign(msg, update.update);
      }
    });

    ev.on('groups.upsert', (updates = []) => {
      for (const group of updates) {
        const id = normalizeJid(group.id);
        if (!id || !isJidGroup(id)) continue;
        syncLidFromGroupMetadata(group, 'store-groups.upsert');
        groupMetadata[id] = group;
        ensureChat(id, { ...group, subject: group.subject, metadata: group, isChats: true });
      }
    });

    ev.on('groups.update', async (updates = []) => {
      await Promise.all(updates.map(async (group) => {
        const id = normalizeJid(group.id);
        if (!id || !isJidGroup(id)) return;
        const metadata = groupMetadata[id] || await fetchGroupMetadata(id, opts.groupMetadata) || { id, participants: [] };
        Object.assign(metadata, group);
        syncLidFromGroupMetadata(metadata, 'store-groups.update');
        groupMetadata[id] = metadata;
        ensureChat(id, { ...group, metadata, subject: metadata.subject, isChats: true });
      }));
    });

    ev.on('group-participants.update', async (update) => {
      const id = normalizeJid(update.id);
      if (!id || !isJidGroup(id)) return;
      const metadata = groupMetadata[id] || await fetchGroupMetadata(id, opts.groupMetadata);
      if (!metadata) return;
      metadata.participants ||= [];
      for (const participant of update.participants || []) syncLidFromParticipant(participant, 'store-group-participants.update');
      const ids = (update.participants || []).map((p) => typeof p === 'string' ? p : p.id).filter(Boolean);
      if (update.action === 'add') {
        metadata.participants.push(...(update.participants || []).map((p) => typeof p === 'string' ? { id: p, admin: null } : { ...p, admin: p.admin || null }));
      } else if (update.action === 'remove') {
        metadata.participants = metadata.participants.filter((p) => !ids.includes(p.id));
      } else if (update.action === 'promote' || update.action === 'demote') {
        for (const participant of metadata.participants) if (ids.includes(participant.id)) participant.admin = update.action === 'promote' ? 'admin' : null;
      }
      groupMetadata[id] = metadata;
      ensureChat(id, { metadata, subject: metadata.subject, isChats: true });
    });

    ev.on('message-receipt.update', (updates = []) => {
      for (const { key, receipt } of updates) {
        const msg = loadMessage(key?.remoteJid, key?.id);
        if (msg) updateMessageWithReceipt(msg, receipt);
      }
    });

    ev.on('messages.reaction', (updates = []) => {
      for (const { key, reaction } of updates) {
        const msg = loadMessage(key?.remoteJid, key?.id);
        if (msg) updateMessageWithReaction(msg, reaction);
      }
    });
  }

  function toJSON() {
    return { chats, messages, groupMetadata };
  }

  function fromJSON(json = {}) {
    Object.assign(chats, json.chats || json.contacts || {});
    Object.assign(groupMetadata, json.groupMetadata || {});
    for (const [jid, list] of Object.entries(json.messages || {})) {
      messages[jid] = Array.isArray(list)
        ? list.map((message) => proto.WebMessageInfo.fromObject(message)).filter((message) => message && message.messageStubType !== WAMessageStubType.CIPHERTEXT)
        : Object.values(list || {}).map((message) => proto.WebMessageInfo.fromObject(message)).filter(Boolean);
    }
    for (const contact of Object.values(chats)) syncLidFromContact(contact, 'store-file-contact');
    for (const metadata of Object.values(groupMetadata)) syncLidFromGroupMetadata(metadata, 'store-file-group');
  }

  function readFromFile(target = file) {
    const data = readJson(target, {});
    fromJSON(data);
  }

  function writeToFile(target = file) {
    if (!target) return;
    writeJson(target, toJSON());
  }

  if (file) ensureDir(path.dirname(file));

  return {
    chats,
    contacts,
    messages,
    groupMetadata,
    state,
    loadMessage,
    upsertMessage,
    fetchGroupMetadata,
    fetchMessageReceipts,
    fetchImageUrl,
    getContact,
    bind,
    toJSON,
    fromJSON,
    readFromFile,
    writeToFile,
  };
}

export default {
  makeInMemoryStore,
};
