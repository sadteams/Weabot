global.autoreplyCooldown = global.autoreplyCooldown || {};
const COOLDOWN_REPLY = 2000; // 2 detik biar gak spam

const BAD_WORDS = ['anjir', 'anjg', 'bgsd', 'kontol', 'memek', 'pantek', 'tolol', 'goblok', 'anjing', 'ngentot', 'kimak', 'pepek'];
const isBad = (text) => BAD_WORDS.some(w => text.includes(w.toLowerCase()));

const greetings = {
  p: ['p', 'pp', 'ppp', 'p?', 'p.'],
  halo: ['halo', 'hai', 'hi', 'hey', 'hallo', 'hii', 'hy'],
  bot: ['bot', 'botz', 'bot on', 'bot aktif'],
  salam: ['assalamualaikum', "assalamu'alaikum", 'assalamu alaikum', 'asalamualaikum', 'ass'],
  makasih: ['makasih', 'thx', 'thanks', 'thank you', 'mksh'],
  punten: ['punten', 'punten ah', 'punten kang', 'punten teh'],
  permisi: ['permisi', 'permisi kak', 'permisi bang', 'permisi teh'],
};



let handler = m => m
handler.before = async function(m, { conn, isOwner, isPrems }) {
  if (m.isBaileys ||!m.text || m.fromMe) return false;
  const text = m.text.toLowerCase().trim();
  const senderName = m.pushName || 'kamu';
  const botId = conn.user.id.replace(/:.*@/, '@');
  const isTagged = m.mentionedJid?.includes(botId);
 
    
    const replies = {
  p: ['p', 'p juga', 'ada apa?', 'kenapa p? 😅'],
  halo: [`halo ${senderName} 👋`, `hai juga`, `halo bang`],
  bot: [`iya aku disini ${senderName}`, `bot aktif 24/7`],
  salam: [`waalaikumsalam wr.wb ${senderName}`],
  makasih: [`sama-sama ${senderName} 😊`, `iyaa`],
  punten: [`mangga ${senderName} 😁`, `punten juga`, `aya naon?`],
  permisi: [`iya mangga ${senderName}`, `permisi juga`, `ada yang bisa dibantu? 😊`],
  tag: [`iya ${senderName}, ada apa?`, `mangga panggil aku 😁`, `aku disini bang`] //
};

  // 1. FILTER KASAR DULU
  if (isBad(text)) {
    await conn.reply(m.chat, `*Ups* 😅 Jangan kasar ya`, m);
    return true;
  }

  // 2. KALAU DI-TAG ATAU DI-REPLY DI GRUP = JAWAB
  if (isTagged) {
    if (global.autoreplyCooldown[m.sender] && Date.now() - global.autoreplyCooldown[m.sender] < COOLDOWN_REPLY &&!isOwner &&!isPrems) return false;
    const reply = replies.tag[Math.floor(Math.random() * replies.tag.length)];
    await conn.reply(m.chat, reply, m);
    global.autoreplyCooldown[m.sender] = Date.now();
    return true;
  }

  // 3. DI GRUP TAPI GAK DI-TAG = DIEM
  if (m.isGroup) return false;

  // 4. CHAT PRIBADI = CEK KATA KUNCI
  for (const [key, triggers] of Object.entries(greetings)) {
    if (triggers.includes(text)) {
      if (global.autoreplyCooldown[m.sender] && Date.now() - global.autoreplyCooldown[m.sender] < COOLDOWN_REPLY &&!isOwner &&!isPrems) return false;
      const reply = replies[key][Math.floor(Math.random() * replies[key].length)];
      await conn.reply(m.chat, reply, m);
      global.autoreplyCooldown[m.sender] = Date.now();
      return true;
    }
  }

  return false; // Kalau bukan kata kunci = diem
}

export default handler
handler.command = [];
handler.limit = false;
handler.exp = 0;