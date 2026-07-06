import moment from 'moment-timezone';

const handler = async (m, { conn, args, text, usedPrefix, command }) => {
  if (!m.isGroup) return m.reply('❌ Command ini hanya bisa digunakan di grup!');
  
  // Cek admin
  const groupMetadata = await conn.groupMetadata(m.chat);
  const participants = groupMetadata.participants;
  const userJid = conn.getJid ? conn.getJid(m.sender) : conn.decodeJid(m.sender);
  const user = participants.find((u) => conn.decodeJid(u.id) === userJid || conn.decodeJid(u.phoneNumber) === userJid);
  const isAdmin = user?.admin === 'admin' || user?.admin === 'superadmin';
  
  if (!isAdmin) return m.reply('❌ Command ini hanya untuk admin grup!');

  const chat = global.db.data.chats[m.chat] || {};
  
  // Cek apakah welcome aktif
  if (chat.welcome === false) {
    return m.reply('❌ Welcome message sedang **OFF**. Aktifkan dulu dengan `.welcome on`');
  }

  // Target yang di-simulate (mention atau sender sendiri)
  let target = m.mentionedJid?.[0] || m.sender;
  const targetJid = conn.getJid ? conn.getJid(target) : conn.decodeJid(target);
  const targetNumber = targetJid.split('@')[0];
  const gpname = groupMetadata.subject;
  const member = groupMetadata.participants.length;
  const time = moment.tz('Asia/Jakarta').format('HH:mm:ss');
  const desc = groupMetadata.desc || '-';

  let pp = global.icon;
  try { pp = await conn.profilePictureUrl(targetJid, 'image'); } catch {}

  // Simulate Welcome
  const defaultWelcome = `┌─⭓「 *WELCOME* 」\n│ *User:* @user\n│ *Group:* ${gpname}\n│ *Member:* ${member}\n│ *Waktu:* ${time}\n└───────────────⭓\nSelamat datang!`;

  let welcomeText = chat.sWelcome || defaultWelcome;
  welcomeText = welcomeText
    .replace(/@user/gi, `@${targetNumber}`)
    .replace(/@group/gi, gpname)
    .replace(/@member/gi, String(member))
    .replace(/@waktu/gi, time)
    .replace(/@desc/gi, desc);

  // Simulate Goodbye
  const defaultGoodbye = `┌─⭓「 *GOODBYE* 」\n│ *User:* @user\n│ *Group:* ${gpname}\n│ *Member:* ${member}\n│ *Waktu:* ${time}\n└───────────────⭓\nSampai jumpa!`;

  let byeText = chat.sBye || defaultGoodbye;
  byeText = byeText
    .replace(/@user/gi, `@${targetNumber}`)
    .replace(/@group/gi, gpname)
    .replace(/@member/gi, String(member))
    .replace(/@waktu/gi, time)
    .replace(/@desc/gi, desc);

  // Kirim hasil simulate
  await conn.sendMessage(m.chat, {
    text: `🎭 *SIMULATE WELCOME/GOODBYE*\n\nBerikut adalah preview pesan yang akan dikirim:\n\n━━━━━━━━━━━━━━━\n\n*PREVIEW WELCOME:*\n${welcomeText}\n\n━━━━━━━━━━━━━━━\n\n*PREVIEW GOODBYE:*\n${byeText}`,
    mentions: [targetJid]
  }, { quoted: m });
};

handler.help = ['simulatetest [@user]'];
handler.tags = ['group'];
handler.command = /^(simulatetest|simtest|simwelcome)$/i;
handler.group = true;
handler.admin = true;

handler.description = "Melakukan simulasi pesan welcome/goodbye untuk menguji konfigurasi grup.";

export default handler;
