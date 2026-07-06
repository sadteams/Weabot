import { exec } from 'child_process';

const handler = async (m) => {
  const input = String(m.text || '').replace(/^\$\s*/, '').trim();
  if (!input) return m.reply('Masukkan perintah!');

  exec(input, async (err, stdout, stderr) => {
    const out = stdout || stderr || (err ? err.stack || String(err) : '(no output)');
    await m.reply(out);
  });
};

handler.help = ['$ <cmd>'];
handler.tags = ['owner'];
handler.customPrefix = /^\$\s*/;
handler.command = /[\s\S]*/;
handler.owner = true;
handler.description = "Menjalankan command shell melalui custom prefix dolar untuk owner.";

export default handler;
