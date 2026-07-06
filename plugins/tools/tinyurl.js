import fetch from 'node-fetch';

const handler = async (m, { text }) => {
  if (!text) return m.reply('Masukkan URL!\nContoh: .tinyurl https://example.com');
  await m.reply(global.wait);
  try {
    const res  = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`);
    const data = await res.text();
    await m.reply(`🔗 *URL Pendek*\n${data}`);
  } catch {
    await m.reply('Gagal mempersingkat URL!');
  }
};
handler.help    = ['tinyurl <url>'];
handler.tags    = ['tools'];
handler.command = /^(tinyurl|short|shorturl)$/i;
handler.description = 'Mempersingkat URL panjang menjadi link TinyURL.';
handler.ai = {
  tool: true,
  name: 'shorten_url',
  description: handler.description,
  permissions: ['user', 'premium', 'owner'],
  risk: 'low',
  parameters: {
    url: { type: 'string', description: 'URL yang ingin dipersingkat', required: true },
  },
  examples: ['pendekkan link https://example.com/path/panjang'],
};

export default handler;
