import { download } from '../../lib/scraper.js'

global.igCache = global.igCache || {}

let handler = async (m, { text, usedPrefix, command, conn, args }) => {

    // CASE 1: TOMBOL KEPIJAT ->.igdl 0 /.igdl 1
    if (command === 'igdl') {
        const index = parseInt(args[0])
        const cache = global.igCache[m.sender]
        if (!cache || Date.now() > cache.expire ||!cache.items[index]) throw `Sesi habis. Kirim link IG lagi.`

        await m.react('⏳')
        const item = cache.items[index]

        if (item.type === 'video') {
            await conn.sendMessage(m.chat, {
                video: { url: item.url }, // STREAM URL = 0KB RAM
                caption: `*${cache.title}*\n@${cache.author} [${index+1}/${cache.total}] ✅`,
                mimetype: 'video/mp4'
            }, { quoted: m });
        } else {
            await conn.sendMessage(m.chat, {
                image: { url: item.url },
                caption: `*${cache.title}*\n@${cache.author} [${index+1}/${cache.total}] ✅`
            }, { quoted: m });
        }
        m.react('✅')
        return
    }

    // CASE 2: KIRIM LINK ->.ig https://...
    if (command === 'ig' || command === 'instagram') {
        if (!text) return m.reply(`👉🏻 *Example*: ${usedPrefix + command} https://www.instagram.com/reel/xxxxx/`)

        if (!text.match(/instagram\.com\/(reel|p|tv)/i)) return m.reply('❌ Link Instagram tidak valid.')

        try {
            m.react('🕒')
            const res = await download(text)
            const results = res.result // <-- INI ARRAY
            if (!res.result ) throw 'Gagal mengambil konten dari Instagram~';

            // SIMPAN SEMUA ITEM KE CACHE
            global.igCache[m.sender] = {
                items: results.map(v => ({ type: v.type, url: v.url, thumb: v.thumbnail })),
                title: 'Instagram Post',
                author: res.author?.replace('@nexray - ', '') || 'unknown',
                total: results.length,
                expire: Date.now() + 300000
            }

            // KIRIM 1 COVER + TOMBOL PILIHAN
            let buttons = results.map((v, i) => ({
                text: `${v.type === 'video'? '🎬' : '🖼️'} Media ${i+1}`,
                id: `${usedPrefix}igdl ${i}`
            }))

            await conn.sendMessage(m.chat, {
                image: { url: results[0].thumbnail }, // Cover pertama
                caption: `*乂 Instagram Downloader*\n\n*Author:* @${global.igCache[m.sender].author}\n*Total Media:* ${results.length}\n\nPilih mau download yang mana:`,
                footer: 'IG Downloader',
                nativeFlow: buttons.slice(0, 5) // Max 5 tombol biar gak error
            }, { quoted: m });

            m.react('✅')

        } catch (error) {
            console.error(error)
            m.react('❌')
            m.reply('❌ ' + error.message)
        }
    }
}
handler.help = ['instagram <url>'];
handler.command = /^(ig|instagram|igdl)$/i
handler.tags = ['downloader'];
handler.limit = 2;

export default handler;