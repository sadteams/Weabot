import fetch from 'node-fetch';

const handler = async (m, { args, text }) => {
  const lang   = args[0] || 'id';
  const query  = m.quoted?.text || text.split(' ').slice(1).join(' ') || text;
  if (!query) return m.reply('Masukkan teks yang mau ditranslate!\nContoh: .translate en Halo dunia');

  await m.reply(global.wait);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(query)}`;
  const res  = await fetch(url);
  const data = await res.json();
  const result = data[0]?.map((x) => x?.[0]).filter(Boolean).join('') || 'Gagal translate';
  await m.reply(`🌐 *Translate → ${lang.toUpperCase()}*\n\n${result}`);
};
handler.help    = ['translate <lang> <teks>'];
handler.tags    = ['tools'];
handler.command = /^(translate|tr)$/i;
handler.description = 'Menerjemahkan teks ke bahasa tujuan seperti id, en, ja, atau bahasa lain.';
handler.ai = {
  tool: true,
  name: 'translate_text',
  description: handler.description,
  permissions: ['user', 'premium', 'owner'],
  risk: 'low',
  parameters: {
    lang: { type: 'string', description: 'Kode bahasa tujuan, contoh en atau id' },
    text: { type: 'string', description: 'Teks yang ingin diterjemahkan', required: true },
  },
  examples: ['terjemahkan ke bahasa inggris: aku sedang belajar'],
};

export default handler;
