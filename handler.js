import {
  getAggregateVotesInPollMessage,
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  jidNormalizedUser,
  WAMessageStubType,
} from '@whiskeysockets/baileys';
import { smsg } from './lib/serialize.js';
import initDatabase from './lib/database.js';
import printMsg from './lib/print.js';
import { getQueue } from './lib/queue.js';
import { resolveJid, sameJid, syncLidFromGroupMetadata, syncLidFromParticipant } from './lib/lid.js';
import moment from 'moment-timezone';
import fs from 'fs';
import util from 'util';
import chalk from 'chalk';


const isConnectionClosedError = (error) => {
  const statusCode = error?.output?.statusCode || error?.output?.payload?.statusCode;
  return statusCode === 428 || /connection closed|socket is reconnecting/i.test(String(error?.message || error));
};

const canSend = (conn) => !conn?.isChild || (conn.status === 'open' && conn.ws?.isOpen);
const isUsageError = (error) => typeof error === 'string' || error?.isUsage || error?.name === 'UsageError';
const usageText = (error) => typeof error === 'string' ? error : error?.message || String(error || '');

const str2Regex = (str) => String(str).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
const resetRegex = (regex) => {
  if (regex instanceof RegExp) regex.lastIndex = 0;
  return regex;
};
const resolveCustomPrefix = (plugin = {}) => {
  if (plugin.customPrefix != null) return plugin.customPrefix;
  if (plugin.costumPrefix != null) return plugin.costumPrefix;
  return undefined;
};
const execPrefix = (prefix, text = '') => {
  if (prefix == null) return null;
  if (prefix instanceof RegExp) {
    const match = resetRegex(prefix).exec(text);
    return match && match.index === 0 ? [match, prefix] : null;
  }
  if (Array.isArray(prefix)) {
    for (const item of prefix) {
      const match = execPrefix(item, text);
      if (match) return match;
    }
    return null;
  }
  if (typeof prefix === 'string') {
    const regex = new RegExp('^' + str2Regex(prefix));
    const match = regex.exec(text);
    return match ? [match, regex] : null;
  }
  return null;
};
const commandAccepts = (prefixCommand, command) => {
  if (!prefixCommand) return false;
  if (prefixCommand instanceof RegExp) return resetRegex(prefixCommand).test(command);
  if (Array.isArray(prefixCommand)) return prefixCommand.some((entry) => entry instanceof RegExp ? resetRegex(entry).test(command) : String(entry).toLowerCase() === command);
  if (typeof prefixCommand === 'string') return prefixCommand.toLowerCase() === command;
  return false;
};

async function handlePluginError(conn, m, error, extra = {}) {
  if (isUsageError(error)) {
    if (canSend(conn)) await m.reply(usageText(error));
    return false;
  }

  console.error(chalk.red(extra.label || '[Plugin Error]'), error);
  if (!(conn.isChild && isConnectionClosedError(error))) await reportPluginError(conn, m, error, extra);
  return true;
}

const ownerJids = () => (global.owner || [])
  .map((owner) => Array.isArray(owner) ? owner[0] : owner)
  .filter(Boolean)
  .map((owner) => String(owner).replace(/[^0-9]/g, ''))
  .filter(Boolean)
  .map((number) => number + '@s.whatsapp.net');

const reportPluginError = async (conn, m, error, extra = {}) => {
  const errText = util.format(error);
  const feature = extra.plugin || m?.plugin || extra.command || m?.command || '-';
  const commandText = extra.commandText || ((m?.usedPrefix || '') + (m?.command || extra.command || '-'));
  let chatName = m?.chat || '-';

  if (m?.isGroup && m.chat) {
    const activeStore = conn.store || global.store;
    const cached = activeStore?.groupMetadata?.[m.chat];
    chatName = cached?.subject || chatName;
    if (!cached?.subject && typeof conn.groupMetadata === 'function') {
      const meta = await conn.groupMetadata(m.chat).catch(() => null);
      chatName = meta?.subject || chatName;
    }
  }

  const senderName = m?.pushName || m?.name || '-';
  const sender = m?.sender || '-';
  const report = [
    '*[ REPORT ERROR ]*',
    '*Fitur:* ' + feature,
    '*Command:* ' + commandText,
    '*User:* ' + senderName + ' (' + sender + ')',
    '*Chat:* ' + chatName + ' (' + (m?.chat || '-') + ')',
    '*Waktu:* ' + moment.tz('Asia/Makassar').format('YYYY-MM-DD HH:mm:ss'),
    '',
    errText
  ].join('\n');

  const reporter = conn.parentConn || conn;
  for (const jid of ownerJids()) {
    try {
      if (!canSend(reporter)) continue;
      await reporter.sendMessage(jid, { text: report }, { quoted: global.fkontak || m });
    } catch (sendError) {
      console.error(chalk.red('[Report Error Failed]'), sendError);
    }
  }
};


async function handleMessage(chatUpdate) {
  if (global.db.data == null) await global.loadDatabase();

  this.msgqueque = this.msgqueque || [];
  if (!chatUpdate) return;

  await this.pushMessage(chatUpdate.messages).catch(console.error);

  let m = chatUpdate.messages[chatUpdate.messages.length - 1];
  if (!m) return;
  if (m.key.fromMe) return;
  if (!m.message) return;

  // Filter protocol / reaction noise
  if (m.message.protocolMessage) return;
  if (m.message.reactionMessage) return;

  try {
    m = (this.serializeM ? this.serializeM(m) : smsg(this, m, this.store || global.store)) || m;
    if (!m) return;
    if (this.isChild && !canSend(this)) return;

    m.exp   = 0;
    m.limit = false;

    // Init database structure
    try { initDatabase(m); } catch (e) { console.error(e); }

    /* ── Roles ─────────────────────── */
    // Normalisasi sender JID via resolver LID/PN
    let senderJid = this.getJid ? this.getJid(m.sender) : resolveJid(m.sender);
    m.sender = senderJid;

    const isROwner = [
      this.decodeJid(this.user?.id),
      ...global.owner.map((a) => {
        const num = Array.isArray(a) ? a[0] : a;
        return num.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      }),
      // Juga cek dalam format LID
      ...global.owner.map((a) => {
        const num = Array.isArray(a) ? a[0] : a;
        return num.replace(/[^0-9]/g, '') + '@lid';
      }),
    ].includes(senderJid);
    
    // Debug: log owner detection
    if (!m.isGroup) {
      console.log(`[DEBUG] isROwner: ${isROwner}`);
      console.log(`[DEBUG] Owner list: ${global.owner.map(a => Array.isArray(a) ? a[0] : a).join(', ')}`);
    }
    const isOwner = isROwner || m.fromMe;
    const isMods  = global.db.data.users[senderJid]?.moderator || false;
    const isPrems = global.db.data.users[senderJid]?.premium   || false;
    const isBans  = global.db.data.users[senderJid]?.banned    || false;
    const isWhitelist = global.db.data.chats[m.chat]?.whitelist || false;

    if (m.isGroup) {
      try {
        const meta = await this.groupMetadata(m.chat);
        syncLidFromGroupMetadata(meta, 'handler-groupMetadata');
        const members = meta.participants.map((a) => this.getJid ? this.getJid(a.phoneNumber || a.id) : resolveJid(a.phoneNumber || a.id));
        global.db.data.chats[m.chat].member = members;
        global.db.data.chats[m.chat].chat += 1;
      } catch {}
    }

    if (isROwner) {
      global.db.data.users[senderJid].premium     = true;
      global.db.data.users[senderJid].premiumDate = 'PERMANENT';
      global.db.data.users[senderJid].limit       = 'PERMANENT';
      global.db.data.users[senderJid].moderator   = true;
    } else if (isPrems) {
      global.db.data.users[senderJid].limit = 'PERMANENT';
    } else if (!isROwner && isBans) return;

    /* ── Self / gconly guards ───────── */
    if (global.selfMode && !isOwner && !isPrems && !isMods && !isWhitelist) return;
    if (global.gconly && !m.isGroup && !isOwner) return;

    // Pastikan user object ada sebelum diakses
    if (!global.db.data.users[senderJid]) {
      global.db.data.users[senderJid] = {
        exp: 0, limit: 0, premium: false, premiumDate: null, moderator: false, banned: false,
        online: 0, chat: 0, registered: false, registeredTime: 0, level: 0,
      };
    }

    global.db.data.users[senderJid].online = Date.now();
    global.db.data.users[senderJid].chat += 1;
    if (global.opts?.autoread) await this.readMessages([m.key]);
    if (global.opts?.nyimak) return;

    if (typeof m.text !== 'string') m.text = '';
    if (m.isBaileys) return;
    m.exp += Math.ceil(Math.random() * 1000);

    /* ── Plugin loop ────────────────── */
    let usedPrefix;
    const _user = global.db.data.users[senderJid];

    const activeStore = this.store || global.store;
    const groupMetadata = (m.isGroup ? ((activeStore?.groupMetadata?.[m.chat]) || (await this.groupMetadata(m.chat).catch(() => null)) || {}) : {}) || {};
    const participants  = (m.isGroup ? groupMetadata.participants : []) || [];
    
    // FIX: Gunakan conn.getJid() untuk match participant
    const userJid = this.getJid ? this.getJid(m.sender) : senderJid;
    
    const user          = (m.isGroup ? participants.find((u) => {
      syncLidFromParticipant(u, 'handler-participant-user');
      return sameJid(u.id, userJid, activeStore) || sameJid(u.phoneNumber, userJid, activeStore);
    }) : {}) || {};
    const bot           = (m.isGroup ? participants.find((u) => {
      syncLidFromParticipant(u, 'handler-participant-bot');
      const botJid = this.getJid ? this.getJid(this.user?.id) : resolveJid(this.user?.id);
      return sameJid(u.id, botJid, activeStore) || sameJid(u.phoneNumber, botJid, activeStore);
    }) : {}) || {};
    const isRAdmin      = user?.admin === 'superadmin' || false;
    const isAdmin       = isRAdmin || user?.admin === 'admin' || false;
    const isBotAdmin    = !!bot?.admin;

    // Update store dengan metadata terbaru
    if (m.isGroup && groupMetadata.id) {
      if (activeStore?.groupMetadata) activeStore.groupMetadata[m.chat] = groupMetadata;
    }

    for (const name in global.plugins) {
      let plugin = global.plugins[name];
      if (!plugin) continue;
      if (plugin.disabled) continue;

      /* run .all() – event hooks */
      if (typeof plugin.all === 'function') {
        try { await plugin.all.call(this, m, chatUpdate); } catch (e) {
          await handlePluginError(this, m, e, { plugin: name + '.all', label: '[Plugin All Error]' });
        }
      }

      const customPrefix = resolveCustomPrefix(plugin);
      const hasCustomPrefix = customPrefix != null;
      const _prefix = hasCustomPrefix ? customPrefix : (this.prefix || global.prefix);
      const match = execPrefix(_prefix, m.text);

      /* .before() – pre-command hook */
      if (typeof plugin.before === 'function') {
        try {
          if (
            await plugin.before.call(this, m, {
              match, conn: this, participants, groupMetadata,
              user, bot, isROwner, isOwner, isRAdmin, isAdmin,
              isBotAdmin, isPrems, isBans, chatUpdate,
            })
          ) continue;
        } catch (e) {
          await handlePluginError(this, m, e, { plugin: name + '.before', label: '[Plugin Before Error]' });
          continue;
        }
      }

      if (typeof plugin !== 'function') continue;
      if (!match?.[0]) continue;

      const result = (match[0] || '')[0] || '';
      if (!hasCustomPrefix && !result) continue;
      usedPrefix = result;

      const noPrefix = result ? m.text.slice(result.length).trim() : m.text.trim();
      const parts = noPrefix.split(/\s+/).filter(Boolean);
      let [command, ...args] = parts;
      let _args = parts.slice(1);
      let text = _args.join(' ');

      if (hasCustomPrefix) {
        const capturedCommand = (match[0] || []).slice(1).find(Boolean);
        command = capturedCommand || command || '';
        args = parts;
        _args = parts;
        text = noPrefix;
      }

      args    = args || [];
      command = (command || '').toLowerCase();
      const fail  = plugin.fail || global.dfail;

      const prefixCommand = plugin.command;
      const isAccept = commandAccepts(prefixCommand, command);


      m.prefix   = !!result;
      usedPrefix = !result ? '' : result;
      m.usedPrefix = usedPrefix;
      if (!isAccept) continue;

      m.plugin     = name;
      m.chatUpdate = chatUpdate;
      m.command    = command;
      m.isCommand  = true;
      m.updateData?.();

      /* Chat/mute ban guard */
      const chatData = global.db.data.chats[m.chat];
      if (chatData?.isBanned && !isOwner) return;
      if (chatData?.mute && !isAdmin && !isOwner) return;

      /* Block command */
      if (global.db.data.settings?.blockcmd?.includes(command)) {
        dfail('block', m, this); continue;
      }

      /* Permission checks */
      if (plugin.rowner && !isROwner)          { fail('rowner',   m, this); continue; }
      if (plugin.owner  && !isOwner)           { fail('owner',    m, this); continue; }
      if (plugin.mods   && !isMods)            { fail('mods',     m, this); continue; }
      if (plugin.premium && !isPrems)          { fail('premium',  m, this); continue; }
      if (plugin.group   && !m.isGroup)        { fail('group',    m, this); continue; }
      if (plugin.botAdmin && !isBotAdmin)      { fail('botAdmin', m, this); continue; }
      if (plugin.admin    && !isAdmin)         { fail('admin',    m, this); continue; }
      if (plugin.private  && m.isGroup)        { fail('private',  m, this); continue; }
      if (plugin.register && !_user.registered){ fail('unreg',    m, this); continue; }

      /* Limit check */
      if (typeof _user.limit === 'number' && _user.limit < 1) {
        await this.reply(m.chat, `*[ LIMIT HABIS ]*\n> Limit kamu habis. Tunggu 24 jam atau upgrade premium.`, m);
        continue;
      }

      /* Level check */
      if (plugin.level && plugin.level > _user.level) {
        await this.reply(m.chat, `*[ LEVEL KURANG ]*\n> Butuh level *${plugin.level}* untuk menggunakan fitur ini.`, m);
        continue;
      }

      /* Stat tracker */
      const now  = Date.now();
      const stat = global.db.data.respon[m.command];
      if (stat) {
        stat.total  = (stat.total  || 0) + 1;
        stat.last   = now;
      } else {
        global.db.data.respon[m.command] = { total: 1, success: 0, last: now, lastSuccess: 0 };
      }

      const xp = 'exp' in plugin ? parseInt(plugin.exp) : 17;
      m.exp += xp;

      const extra = {
        match, usedPrefix, noPrefix, _args, args, command, text,
        conn: this, participants, groupMetadata, user, bot,
        isROwner, isOwner, isRAdmin, isAdmin, isBotAdmin,
        isPrems, isBans, chatUpdate,
      };

      try {
        await plugin.call(this, m, extra);
        if (!isPrems) m.limit = m.limit || plugin.limit || true;

        const s = global.db.data.respon[m.command];
        s.success     = (s.success || 0) + 1;
        s.lastSuccess = now;
      } catch (e) {
        const reported = await handlePluginError(this, m, e, {
          plugin: m.plugin,
          command,
          commandText: usedPrefix + command,
          label: '[Plugin Error]',
        });
        if (reported) {
          m.error = e;
          if (canSend(this)) await m.reply('*[ Sistem ]* Terjadi error pada bot!');
        }
      } finally {
        if (typeof plugin.after === 'function') {
          try { await plugin.after.call(this, m, extra); } catch (e) {
            await handlePluginError(this, m, e, { plugin: name + '.after', label: '[Plugin After Error]' });
          }
        }
      }
      break;
    }
  } catch (e) {
    console.error(chalk.red('[Handler Error]'), e);
    if (m && !(this.isChild && isConnectionClosedError(e))) {
      await reportPluginError(this, m, e, { plugin: 'handler', commandText: m.text || '-' });
    }
  } finally {
    /* Exp & limit update */
    if (m) {
      try {
        const finalSenderJid = this.getJid ? this.getJid(m.sender) : resolveJid(m.sender);
        const u = global.db.data.users[finalSenderJid];
        if (u) {
          u.exp   += m.exp   || 0;
          u.limit -= m.limit ? 1 : 0;
        }
      } catch (e) {
        console.error('[Handler] Error updating user data:', e);
      }
    }

    try { await printMsg(m, this); } catch {}
  }
}


export async function handler(chatUpdate) {
  const message = chatUpdate?.messages?.[chatUpdate.messages.length - 1];
  const id = message?.key?.id || Date.now();
  const jid = message?.key?.remoteJidAlt || message?.key?.remoteJid || 'unknown';
  const queue = this.queue || global.handlerQueue || getQueue('handler', {
    concurrency: Number(global.queueConcurrency || 1),
    interval: Number(global.queueInterval || 150),
  });

  if (global.opts?.queue === false || global.opts?.queque === false) return handleMessage.call(this, chatUpdate);
  return queue.add(() => handleMessage.call(this, chatUpdate), { id: jid + ':' + id });
}


export async function participantsUpdate({ id, participants, action }) {
  // Helper untuk kirim debug ke owner
  const sendDebug = async (msg) => {
    for (const ow of global.owner) {
      const ownerNum = Array.isArray(ow) ? ow[0] : ow;
      const ownerJid = ownerNum.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      try { await this.sendMessage(ownerJid, { text: `*[DEBUG WELCOME]*\n${msg}` }); } catch {}
    }
  };
  if (global.db.data == null) await global.loadDatabase();
  const chat = global.db.data.chats[id] || {};

  switch (action) {
    case 'add':
    case 'remove': {
      if (chat.welcome === false) return
      let meta;
      try { 
        meta = await this.groupMetadata(id);
        syncLidFromGroupMetadata(meta, 'participantsUpdate-groupMetadata'); 
      } catch (e) { 
        break; 
      }

      for (const user of participants) {
        // FIX: user dari event participantsUpdate adalah Object
        // Format: { id: '...@lid', phoneNumber: '...@s.whatsapp.net', admin: null }
        // PRIORITAS: phoneNumber (JID normal) sebelum id (LID)
        const rawId = user?.phoneNumber || user?.id || user;
        // Normalisasi JID untuk hindari LID issue
        syncLidFromParticipant(user, 'participantsUpdate-user');
        let userJid = this.getJid ? this.getJid(rawId) : resolveJid(rawId);
        
        // FIX: Fallback ke rawId jika userJid masih @lid (sama seperti profile.js)
        if (userJid.endsWith('@lid')) {
          userJid = rawId;
        }
        
        const userNumber = userJid.split('@')[0];

        const gpname = meta.subject;
        const member = meta.participants.length;
        const time = moment.tz('Asia/Jakarta').format('HH:mm:ss');

        let pp = global.icon;
        pp = await this.profilePictureUrl(userJid, 'image');

        let defaultText = action === 'add'
          ? `┌─⭓「 *WELCOME* 」\n│ *User:* @user\n│ *Group:* ${gpname}\n│ *Member:* ${member}\n│ *Waktu:* ${time}\n└───────────────⭓\nSelamat datang!`
          : `┌─⭓「 *GOODBYE* 」\n│ *User:* @user\n│ *Group:* ${gpname}\n│ *Member:* ${member}\n│ *Waktu:* ${time}\n└───────────────⭓\nSampai jumpa!`;

        // Ambil custom message atau pakai default
        let text = action === 'add' ? (chat.sWelcome || defaultText) : (chat.sBye || defaultText);

        // Replace placeholder
        text = text
          .replace(/@user/gi, `@${userNumber}`)
          .replace(/@group/gi, gpname)
          .replace(/@member/gi, String(member))
          .replace(/@waktu/gi, time)
          .replace(/@desc/gi, meta.desc || '-');

        await this.sendMessage(id, {
          text,
          mentions: [userJid],
          contextInfo: {
            mentionedJid: [userJid],
            externalAdReply: {
              title: action === 'add' ? `Welcome notification!` : `Goodbye, notification!`,
              body: global.wm || '',
              thumbnailUrl: pp,
              mediaType: 1,
              renderLargerThumbnail: true,
            },
          },
        });
      }
      break;
    }
    case 'promote':
    case 'demote': {
      if (chat.detect === false) break;
      const user = participants[0];
      syncLidFromParticipant(user, 'participantsUpdate-admin');
      const userJid = this.getJid ? this.getJid(user) : resolveJid(user);
      const userNumber = userJid.split('@')[0];
      
      const text = (action === 'promote'
        ? (chat.sPromote || `@${userNumber} sekarang menjadi Admin`)
        : (chat.sDemote || `@${userNumber} tidak lagi Admin`)
      );
      await this.sendMessage(id, { text, mentions: [userJid] });
      break;
    }
  }
}


global.dfail = async (type, m, conn) => {
  const msgs = {
    owner:    `*OWNER ONLY*\nFitur ini hanya untuk Owner!`,
    rowner:   `REAL OWNER ONLY*\nFitur ini hanya untuk Real Owner!\n`,
    mods:     `MODERATOR ONLY*\n  Fitur ini hanya untuk Moderator bot!\n`,
    premium:  `*PREMIUM ONLY*\n Fitur ini hanya untuk pengguna Premium!\n`,
    group:    `*GROUP ONLY*\n Fitur ini hanya bisa digunakan di Group!\n`,
    private:  `*PRIVATE ONLY*\n Fitur ini hanya bisa digunakan di Private!\n`,
    admin:    `ADMIN ONLY*\n Fitur ini hanya untuk Admin group!\n`,
    botAdmin: `BOT BUKAN ADMIN*\n Jadikan bot Admin terlebih dahulu!\n`,
    block:    `COMMAND DIBLOKIR*\n Command ini telah diblokir!\n`,
    unreg:    `BELUM DAFTAR*\n Ketik *.daftar nama.umur* untuk mendaftar!\n`,
  };

  if (msgs[type]) {
    return conn.sendMessage(
      m.chat,
      {
        text: msgs[type],
        contextInfo: {
          externalAdReply: {
            title: 'Access Denied!',
            body: global.wm || '',
            thumbnailUrl: global.thumb || undefined,
            mediaType: 1,
            renderLargerThumbnail: false,
          },
        },
      },
      { quoted: m }
    );
  }
};
