const handler = async (m) => {
  const uptime = process.uptime();
  const h   = Math.floor(uptime / 3600);
  const min = Math.floor((uptime % 3600) / 60);
  const s   = Math.floor(uptime % 60);
  await m.reply(`┌─⭓「 *RUNTIME* 」\n│ *Uptime :* ${h} jam ${min} menit ${s} detik\n└───────────────⭓`);
};
handler.help    = ['runtime'];
handler.tags    = ['info'];
handler.command = /^(runtime|uptime)$/i;
handler.description = "Menampilkan lama waktu bot berjalan sejak proses terakhir dimulai.";
handler.ai = {
  tool: true,
  name: "bot_runtime",
  description: handler.description,
  permissions: ["user","premium","owner"],
  risk: "low",
  parameters: {},
  examples: ["bot sudah jalan berapa lama"],
};

export default handler;
