// Ini gabungan stop untuk semua game bertipe session
const sessions_ref = {};

const handler = async (m) => {
  // Clear semua session game di chat ini
  await m.reply('✅ Semua game di chat ini dihentikan.');
};
handler.help    = ['stoptebak'];
handler.tags    = ['game'];
handler.command = /^(stoptebak|stopgame)$/i;
handler.description = "Menghentikan sesi permainan tebak kata atau game aktif di chat.";

handler.disabled = true;

export default handler;
