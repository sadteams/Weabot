const handler = async (m, { conn }) => {
  // Target dari mention atau quoted
  let target = m.mentionedJid?.[0] || m.quoted?.sender || m.sender;
  
  // FIX: Normalisasi JID (hindari LID)
  const targetJid = conn.getJid ? conn.getJid(target) : conn.decodeJid(target);
  const targetNormal = targetJid.endsWith('@lid') ? target : targetJid;
  
  const name = await conn.getName(targetNormal);
  
  await conn.sendMessage(m.chat, {
    text: `┌─⭓「 *CEK ID* 」\n│ *Nama  :* ${name}\n│ *JID   :* ${targetNormal}\n│ *Nomor :* ${targetNormal.split('@')[0]}\n└───────────────⭓`,
    mentions: [targetNormal]
  }, { quoted: m });
};
handler.help    = ['cekid [@user]'];
handler.tags    = ['info'];
handler.command = /^(cekid|id|who)$/i;
handler.description = "Menampilkan JID, nomor, dan nama user dari diri sendiri, mention, atau pesan yang direply.";
handler.ai = {
  tool: true,
  name: "check_user_id",
  description: handler.description,
  permissions: ["user","premium","owner"],
  risk: "low",
  parameters: {},
  examples: ["cek id saya"],
};

export default handler;
