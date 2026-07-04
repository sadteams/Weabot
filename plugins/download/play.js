import { ytplay, ytmp3, ytmp4 } from '../../lib/scraper.js'

global.playCache = global.playCache || {}

let handler = async (m, { conn, text, usedPrefix, command, args }) => {
 
    switch (command) {

    case 'play': {
        if (!text?.trim()) throw `Contoh: ${usedPrefix}play negoro angin`
        
        await m.react('🔍')
        let search = await ytplay(text.trim())
        
        if (search?.status === false ||!search?.result?.id) throw `Gagal: ${search?.error || 'Lagu tidak ditemukan'}`
        
        const { title, channel, id, duration, thumbnail, url, views, upload_at } = search.result

        // FIX 1: Simpan ID aja. Jangan url/download_url
        global.playCache[m.sender] = {
            id: id,
            title: title,
            thumb: thumbnail,
            expire: Date.now() + 300000 // 5 menit
        }

        await conn.sendMessage(m.chat, {
            image: { url: thumbnail },
            caption: `*乂 YouTube Play*\n\n*Title:* ${title}\n*Duration:* ${duration}\n*Channel:* ${channel}\n*View:* ${views}\n*Link:* ${url}\n\nPilih mau download apa:`,
            footer: 'youtube downloader',
            nativeFlow: [{
                text: '🎵 MP3 Audio',
                id: `${usedPrefix}ytaudio`
            }, {
                text: '🎬 MP4 Video',
                id: `${usedPrefix}ytvideo`
            }],
        }, { quoted: m })
        await m.react('✅')
        break;
    }

    case 'ytaudio': case 'ytma': case 'yt-audio': {
        // FIX 2: Ambil ID dari argumen atau cache. Jangan cek url doang
        const id = args[0]? String(args[0]).match(/([A-Za-z0-9_-]{11})/i)?.[1] : global.playCache[m.sender]?.id
        if (!id) throw `Sesi habis. Contoh: ${usedPrefix}ytma https://youtu.be/ID`

        await m.react('⏳')
        let res = await ytmp3(`https://youtu.be/${id}`) // FIX 3: Kirim URL lengkap
        let audioUrl = res.result?.url || res.result?.download || res.url; // FIX 4: fallback
        if (!audioUrl) throw 'Gagal dapat link audio. API down?'

        await conn.sendMessage(m.chat, {
            audio: { url: audioUrl }, // FIX 4: pakai audioUrl
            mimetype: 'audio/mpeg',
            fileName: `${global.playCache[m.sender]?.title || 'audio'}.mp3`
        }, { quoted: m })

        delete global.playCache[m.sender]
        await m.react('✅')
        break;
    }

    case 'ytvideo': case 'ytv': case 'ytmp4': {
        const id = args[0]? String(args[0]).match(/([A-Za-z0-9_-]{11})/i)?.[1] : global.playCache[m.sender]?.id
        const resQuality = args[1] || '480' // FIX: Turunin default ke 480p biar gak berat
        if (!id) throw `Sesi habis. Contoh: ${usedPrefix}ytmp4 https://youtu.be/ID`

        await m.react('⏳')
        let res = await ytmp4(`https://youtu.be/${id}`, resQuality)
        let videoUrl = res.result?.url || res.result?.download || res.url;
        let resFinal = res.result?.resolusi || resQuality
        if (!videoUrl) throw 'Gagal dapat link video. API down?'

        await m.reply(`Mengunduh ${resFinal}p... Tunggu bentar ya`) // Kasih tau user

        // FIX: Download ke buffer dulu, baru kirim. Anti 504
        let buffer = await fetch(videoUrl).then(v => v.arrayBuffer()).then(b => Buffer.from(b))
        
        await conn.sendFile(m.chat, buffer, `${global.playCache[m.sender]?.title || 'video'}.mp4`, `*${global.playCache[m.sender]?.title || 'YouTube Video'}* ${resFinal}p ✅`, m)

        delete global.playCache[m.sender]
        await m.react('✅')
        break;
    }
   }
}
handler.help = ['play <query>', 'ytmp3 <url>', 'ytmp4 <url>'];
handler.command = /^(play|ytaudio|ytma|yt-audio|ytvideo|ytv|ytmp4)$/i
handler.tags = ['downloader'];

export default handler