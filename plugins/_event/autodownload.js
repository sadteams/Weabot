import { download, ytmp4, getPlatform } from '../../lib/scraper.js'
import { webp2mp4 } from '../../lib/webp2mp4.js'
import fetch from 'node-fetch'

let handler = m => m

handler.before = async function (m, { conn }) {
    if (m.isBaileys || m.fromMe) return
    let chat = db.data.chats[m.chat]
    let user = db.data.users[m.sender]
    let text = m.text || ''

    if (m.chat.endsWith('broadcast')) return

    let url = text.match(/https?:\/\/\S+/i)?.[0]
    if (!url) return

    let { platform } = getPlatform(url)
    let supported = ['tiktok', 'instagram', 'facebook', 'youtube', 'pinterest']
    if (!supported.includes(platform)) return

if (!m.isGroup) return m.reply(`❌ *Fitur Auto Download hanya bisa di Grup*`)

    if (chat.isBanned) return m.reply(`*Grup/Chat ini diblokir*`)
    if (user.banned) return m.reply(`*Kamu diblokir*\n\nKamu tidak bisa menggunakan fitur Auto Download.`)
    if (!chat.autodownload) return m.reply(`*Fitur Auto Download Mati*\n\nNyalakan dulu dengan cara chat bot: *.autodownload on*`)

    console.log('[AUTO DL] Ketemu link:', url, 'Platform:', platform)
    try {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key }})

        let userTag = `@${m.sender.split('@')[0]}`
        let res = await download(url)
        let results = Array.isArray(res.result)? res.result : [res.result]

        if (platform === 'tiktok') {
            let caption = `*TT Downloader*\n\nRequest dari: ${userTag}`
            await conn.sendFile(m.chat, results[0].data || results[0].url, 'tt.mp4', caption, m, { mentions: [m.sender] })
        }
        else if (platform === 'instagram') {
            for(let v of results) {
                let caption = `*IG Downloader*\n\nRequest dari: ${userTag}`
                await conn.sendFile(m.chat, v.url, 'ig.mp4', caption, m, { mentions: [m.sender] })
            }
        }
        else if (platform === 'facebook') {
            let caption = `*FB Downloader*\n\nRequest dari: ${userTag}`
            await conn.sendFile(m.chat, res.links?.hd || res.links?.sd, 'fb.mp4', caption, m, { mentions: [m.sender] })
        }
        else if (platform === 'youtube') {
            let resYt = await ytmp4(url)
            let caption = `*${resYt.result.title}*\n\nRequest dari: ${userTag}`
            await conn.sendFile(m.chat, resYt.result.url, 'yt.mp4', caption, m, { mentions: [m.sender] })
        }
        else if (platform === 'pinterest') {
            for (const media of results) {
                const { title, image, video } = media;
                const caption = `*Pinterest Downloader*\n\n*Caption:* ${title || '-'}\n\nRequest dari: ${userTag}`

                try {
                    const fin = image? image : video
                    const ext = fin.includes('.gif')? 'gif' : fin.includes('.jpg') || fin.includes('.jpeg') || fin.includes('.png')? 'jpg' : 'mp4'
                    console.log('[pinterest] file type:', ext)

                    if (ext === 'gif') {
                        const resFetch = await fetch(fin, { headers: { 'user-agent': 'Mozilla/5.0' }})
                        const buffer = Buffer.from(await resFetch.arrayBuffer())
                        const mp4 = await webp2mp4(buffer)
                        // FIX TAG: mentions harus di object ke 5
                        await conn.sendFile(m.chat, mp4, 'pinterest.mp4', caption, m, { mentions: [m.sender] })
                    } else if (ext === 'jpg') {
                        // FIX TAG: pake sendMessage + mentions di opsi
                        await conn.sendMessage(m.chat, {
                            image: { url: image },
                            caption,
                            mentions: [m.sender] //
                        }, { quoted: m })
                    } else {
                        // FIX TAG: pake sendMessage + mentions di opsi
                        await conn.sendMessage(m.chat, {
                            video: { url: video },
                            caption,
                            mentions: [m.sender] //
                        }, { quoted: m })
                    }
                } catch (error) {
                    console.error('[Pinterest Loop Error]', error)
                }
            }
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key }})
    } catch (e) {
        console.error(e)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key }})
        await conn.reply(m.chat, `Gagal download: ${e.message}`, m)
    }
    return true
}

export default handler