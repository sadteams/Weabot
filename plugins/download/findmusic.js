import axios from 'axios'
import FormData from 'form-data'

let handler = async (m, { conn }) => {
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || ''
    
    if (!/audio|video/.test(mime)) return m.reply(`👉🏻 *Reply audio/video dengan perintah .shazam*\nMax 10 detik ya`)
    
    m.reply('🎵 *Menganalisa musik... tunggu 3 detik*')
    
    try {
        let media = await q.download()
        let form = new FormData()
        form.append('file', media, 'audio.mp3')
        form.append('api_token', '1664b549681c03f41567850b35cda8e1') // Daftar gratis di audd.io
        form.append('return', 'apple_music,spotify,lyrics')
        
        let { data } = await axios.post('https://api.audd.io/', form, {
            headers: form.getHeaders()
        })
        
        if (!data.result) return m.reply('❌ Musik tidak ditemukan. Coba kirim yg lebih jelas 10 detik')
        
        let res = data.result
        let caption = `🎶 *Ditemukan!*\n
*Judul*: ${res.title}
*Penyanyi*: ${res.artist}
*Album*: ${res.album || '-'}
*Rilis*: ${res.release_date || '-'}

🔗 *Spotify*: ${res.spotify?.external_urls?.spotify || '-'}
🔗 *Apple*: ${res.apple_music?.url || '-'}
`
        if(res.lyrics) caption += `\n📝 *Lirik:*\n${res.lyrics.substring(0, 500)}...`
        
        await conn.sendMessage(m.chat, {
            image: { url: res.song_link }, // thumbnail
            caption: caption
        }, { quoted: m })
        
    } catch (e) {
        console.log(e)
        m.reply('❌ Gagal menganalisa. Coba audio yg lebih jelas')
    }
}
handler.help = ['shazam']
handler.tags = ['tools']
handler.command = /^(shazam|findmusic|findsong)$/i
handler.limit = true

export default handler