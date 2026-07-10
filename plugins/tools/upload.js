import { upload } from '../../lib/scraper.js'
let handler = async (m, { conn }) => {
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || ''
    if (!mime) return m.reply('📎 Reply gambar/video dulu bang')

    let wm = await m.reply('🚀 Uploading ke Discord...')

    try {
        let buffer = await q.download()
        if (buffer.length > 26214400) return m.reply('File kegedean. Max 25MB')

        let res = await upload(buffer)
        
        conn.sendMessage(m.chat, {
   image: { url: res }, // 1. Media
   caption: 'upload berhasil!', // 2. Teks atas
   footer: global.wm, // 3. Teks bawah kecil
   
   // 4. Bagian Offer/Kupon di atas tombol
   offerText: 'by The.sad.boy01',
   
   offerUrl: 'https://github.com/sadteams/Weabot/tree/update',


   // 5. Tombol/Tombol Interaktif
   nativeFlow: [{
      
      text: '📋 Copy',
      copy: res // auto copy ke clipboard
   }, {
      text: '🌐 Source',
      url: res, 
      useWebview: true // buka in-app browser
     }],
   interactiveAsTemplate: false, // false = bubble chat, true = template/bisnis
}, { quoted: m })
    } catch (e) {
        console.log(e)
        m.reply(`❌ Error: ${e.message}`)
    }
}

handler.help = ['upload']
handler.tags = ['tools']
handler.command = /^(upload|up)$/i
export default handler