const handler = async (m) => {
  const user  = global.db.data.users[m.sender];
  const limit = user?.limit ?? 100;
  const isPerm = limit === 'PERMANENT';
  await m.reply(
    `┌─⭓「 *LIMIT* 」\n│ *Limit :* ${isPerm ? '∞ Unlimited' : limit}\n│ *Reset :* Setiap 24 jam\n└───────────────⭓`
  );
};
handler.help    = ['limit'];
handler.tags    = ['info'];
handler.command = /^(limit|ceklimit)$/i;
handler.description = "Menampilkan sisa limit penggunaan fitur untuk user.";
handler.ai = {
  tool: true,
  name: "user_limit",
  description: handler.description,
  permissions: ["user","premium","owner"],
  risk: "low",
  parameters: {},
  examples: ["cek limit saya"],
};

export default handler;
