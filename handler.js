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
          console.error(e);
          if (!(this.isChild && isConnectionClosedError(e))) await reportPluginError(this, m, e, { plugin: name + '.all' });
        }
      }

      const str2Regex = (str) => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
      const _prefix = plugin.customPrefix
        ? plugin.customPrefix
        : this.prefix
        ? this.prefix
        : global.prefix;

      const match = (
        _prefix instanceof RegExp
          ? [[_prefix.exec(m.text), _prefix]]
          : Array.isArray(_prefix)
          ? _prefix.map((p) => {
              const re = p instanceof RegExp ? p : new RegExp(str2Regex(p));
              return [re.exec(m.text), re];
            })
          : typeof _prefix === 'string'
          ? [[new RegExp(str2Regex(_prefix)).exec(m.text), new RegExp(str2Regex(_prefix))]]
          : [[[], new RegExp()]]
      ).find((p) => p[1]);

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
          console.error(e);
          if (!(this.isChild && isConnectionClosedError(e))) await reportPluginError(this, m, e, { plugin: name + '.before' });
          continue;
        }
      }

      if (typeof plugin !== 'function') continue;
      if (!match) continue;

      const result =
        ((global.opts?.multiprefix ?? true) && (match[0] || '')[0]) ||
        ((global.opts?.noprefix ?? false) ? null : (match[0] || '')[0]);
      usedPrefix = result;

      let noPrefix;
      if (isOwner) {
        noPrefix = !result ? m.text : m.text.replace(result, '');
      } else {
        noPrefix = !result ? '' : m.text.replace(result, '').trim();
      }

      let [command, ...args] = noPrefix.trim().split(/\s+/).filter(Boolean);
      args    = args || [];
      const _args = noPrefix.trim().split(/\s+/).slice(1);
      const text  = _args.join(' ');
      command     = (command || '').toLowerCase();
      const fail  = plugin.fail || global.dfail;

      const prefixCommand = !result ? plugin.customPrefix || plugin.command : plugin.command;
      const isAccept =
        (prefixCommand instanceof RegExp && prefixCommand.test(command)) ||
        (Array.isArray(prefixCommand) && prefixCommand.some((c) =>
          c instanceof RegExp ? c.test(command) : c === command
        )) ||
        (typeof prefixCommand === 'string' && prefixCommand === command);

      m.prefix   = !!result;
      usedPrefix = !result ? '' : result;
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
        m.error = e;
        console.error(chalk.red('[Plugin Error]'), e);
        if (!(this.isChild && isConnectionClosedError(e))) {
          await reportPluginError(this, m, e, {
            plugin: m.plugin,
            command,
            commandText: usedPrefix + command,
          });
          if (canSend(this)) await m.reply('*[ Sistem ]* Terjadi error pada bot!');
        }
      } finally {
        if (typeof plugin.after === 'function') {
          try { await plugin.after.call(this, m, extra); } catch (e) { console.error(e); }
        }
      }
      break;
    }
  } catch (e) {
    console.error(chalk.red('[Handler Error]'), e);
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
