import { download } from '../../lib/scraper.js' // fix path
import { webp2mp4 } from '../../lib/webp2mp4.js'
import fetch from 'node-fetch'

const handler = async (m, { text, usedPrefix, command, conn }) => {
   
      if (!text) {
          m.react('❓')
         return m.reply(`👉🏻 *Example*: ${usedPrefix + command} https://pin.it/5fXaAWE/`)
}
      if (!text.match(/pin\.it|pinterest\.com\/pin/i)){
          m.react('🚫')
         return m.reply('❌ Link Pinterest tidak valid.')
    }
try {
      m.react('🕒')
      const data = await download(text) 
      const results = Array.isArray(data.result)? data.result : [data.result];
    if (!data.status || !results ) {
        m.react('❌')
      return m.reply('❌ Gagal mengambil konten dari Pinterest~');

    }

      for (const media of results) {
        const { title, author, thumbnail, image, video } = media;
   try {
       const fin = image ? image : video
          const ext = fin.includes('.gif') ? 'gif' : fin.includes('.jpg') || fin.includes('.jpeg') || fin.includes('.png') ? 'jpg' : fin.includes('.mp4');
        console.log('[pinterest] file type:', ext, '- Starting');
      if (ext === 'gif') {
        const res = await fetch(image, {
        headers: {
            'user-agent': 'Mozilla/5.0'
        }
    })
      const buffer = Buffer.from(await res.arrayBuffer())
      
        const mp4 = await webp2mp4(buffer)
      await conn.sendFile(m.chat, mp4, 'pinterest.mp4', `- *Caption :* \n${title}`, m)
          m.react('✅')
       } else if (ext === 'jpg') {
        await conn.sendMessage(m.chat, {
           image: { url: image },
           caption: `- *Caption :* \n${title}`
       }, { quoted: m });
           m.react('✅')
       } else {
        await conn.sendMessage(m.chat, {
           video: { url: video },
           caption: `- *Caption :* \n${title}`
           }, { quoted: m });
              m.react('✅')
       }
     } catch (error) {
      console.error(error)
      m.react('❌')
      m.reply('❌ ' + error.message)
   }     
            }
    } catch (error) {
      console.error(error)
      m.react('❌')
      m.reply('❌ ' + error.message)
   }
          
}
handler.help = ['pinterest <url>'];
handler.tags = ['downloader'];
handler.command = /^(pin|pinterest)$/i;
handler.limit = 2;

export default handler;