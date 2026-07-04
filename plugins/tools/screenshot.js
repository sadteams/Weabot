import { screenshot } from '../../lib/scraper.js' // fix path
let handler = async(m, { conn, usedPrefix, command, text}) => {
  if (!text) throw 'mana link nya ?'

m.react('🕒')
      const data = await screenshot (text) 
      const results = Array.isArray(data.result)? data.result : [data.result];
    if (!data.status || !results ) {
        m.react('❌')
      return m.reply(`❌ Gagal mengambil konten dari ${text}~`);

    }
      for (const media of results) {
        const { title, description, url, file_url, publisher } = media;
   
      try { 
    await conn.sendMessage(m.chat, {
           image: { url: file_url },
           caption: `- *Caption :* \n${title}`
       }, { quoted: m });
           m.react('✅')
            } catch (error) {
      console.error(error)
      m.react('❌')
      m.reply('❌ ' + error.message)
   }
  }
}
handler.help = handler.alias = ['ssweb']
handler.tags = ['internet']
handler.command = /^ss(web)?|scre?e?nshu?o?t$/i
export default handler