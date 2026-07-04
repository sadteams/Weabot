import { download } from '../../lib/scraper.js'

global.tiktokCache = global.tiktokCache || {}

let handler = async (m, { text, usedPrefix, command, conn, args }) => {

    // CASE 1: TOMBOL KEPIJAT ->.ttdl nowm /.ttdl audio
    if (command === 'ttdl') {
        const type = args[0]
        const cache = global.tiktokCache[m.sender]
        if (!cache || Date.now() > cache.expire) throw `Sesi habis. Kirim link tiktok lagi .tiktok url`

        await m.react('⏳')

        if (type === 'nowm') {
            await conn.sendMessage(m.chat, {
                video: { url: cache.nowm }, // STREAM URL = ANTI ENOSPC
                caption: `*${cache.title}*\n@${cache.author} ✅ No WM`,
                mimetype: 'video/mp4'
            }, { quoted: m });
        }

        if (type === 'audio') {
            await conn.sendMessage(m.chat, {
                audio: { url: cache.music },
                mimetype: 'audio/mpeg',
                fileName: `${cache.author}.mp3`
            }, { quoted: m });
        }

        delete global.tiktokCache[m.sender]
        return m.react('✅') // STOP DISINI JANGAN LANJUT KE CASE TT
    }

    // CASE 2: KIRIM LINK ->.tt https://...
    if (command === 'tt' || command === 'tiktok') {
        if (!text) {
            m.react('❓')
            return m.reply(`👉🏻 *Example*: ${usedPrefix + command} https://vt.tiktok.com/xxxxx/`)
        }

        if (!text.match(/tiktok\.com|vt\.tiktok\.com/i)){
            m.react('🚫')
            return m.reply('❌ Link TikTok tidak valid.')
        }

        try {
            m.react('🕒')
            const res = await download(text)
            const data = res.result
            if (!res.status ||!data ) throw 'Gagal mengambil konten dari TikTok~';

            // SIMPAN KE CACHE
            global.tiktokCache[m.sender] = {
                nowm: data.data, // No WM URL
                title: data.title,
                author: data.author.nickname,
                music: data.music_info?.url,
                expire: Date.now() + 300000 // 5 menit
            }

            const caption = `*乂 TikTok Downloader*\n\n*Title:* ${data.title}\n*Author:* @${data.author.nickname}\n*Durasi:* ${data.duration}\n*Views:* ${data.stats.views}`

            await conn.sendMessage(m.chat, {
                image: { url: data.cover },
                caption: caption,
                footer: 'TikTok Downloader',
                nativeFlow: [{
                    text: '🎬 No Watermark HD',
                    id: `${usedPrefix}ttdl nowm` // <-- Ini bakal trigger case ttdl di atas
                }, {
                    text: '🎵 Audio MP3',
                    id: `${usedPrefix}ttdl audio`
                }],
            }, { quoted: m });

            m.react('✅')

        } catch (error) {
            console.error(error)
            m.react('❌')
            m.reply('❌ ' + error.message)
        }
    }
}
handler.command = /^(tt|tiktok|ttdl)$/i // <-- DAFTARIN SEMUA COMMAND DI SINI
handler.help = ['tiktok <url>']
handler.tags = ['downloader'];
handler.limit = 2;

export default handler;