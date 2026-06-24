import similarity from 'similarity'

const timeout = 120000
const poin = 4999
const money = 20
const threshold = 0.72

function shuffleArray(arr) {
    let array = [...arr]
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]
    }
    return array
}

let handler = async (m, { conn, command, usedPrefix }) => {
    conn.tebaklagu = conn.tebaklagu || {}
    conn.tebaklaguPool = conn.tebaklaguPool || {}
    let id = m.chat

    if (command === 'nafi') {
        if (!(id in conn.tebaklagu))
            return m.reply('Tidak ada soal yang sedang berlangsung!')
        let game = conn.tebaklagu[id]
        return conn.reply(m.chat, `🔍 *Hint:* \`${game.hint}\``, m)
    }

    if (id in conn.tebaklagu) {
        return conn.reply(
            m.chat,
            'Masih ada soal yang belum terjawab!',
            conn.tebaklagu[id].msgText
        )
    }

    try {
        let src = await (await fetch('https://raw.githubusercontent.com/KazukoGans/database/refs/heads/main/games/tebaklagu.json')).json()
        let allTitles = src.map(s => s.judul.toLowerCase().trim())

        let pool = conn.tebaklaguPool[id]

        const poolTitles = pool ? new Set(pool) : new Set()
        const dbTitles = new Set(allTitles)

        const hasDeletedSongs = pool && pool.some(t => !dbTitles.has(t))
        const hasNewSongs = pool && allTitles.some(t => !poolTitles.has(t))

        if (!pool || pool.length === 0 || hasDeletedSongs || hasNewSongs) {
            conn.tebaklaguPlayed = conn.tebaklaguPlayed || {}
            conn.tebaklaguPlayed[id] = conn.tebaklaguPlayed[id] || new Set()

            const playedSet = conn.tebaklaguPlayed[id]
            const unplayed = allTitles.filter(t => !playedSet.has(t))

            if (unplayed.length === 0) {
                conn.tebaklaguPlayed[id] = new Set()
                conn.tebaklaguPool[id] = shuffleArray([...allTitles])
            } else {
                conn.tebaklaguPool[id] = shuffleArray(unplayed)
            }

            pool = conn.tebaklaguPool[id]
        }

        let pickedTitle = pool.pop()
        conn.tebaklaguPool[id] = pool

        conn.tebaklaguPlayed = conn.tebaklaguPlayed || {}
        conn.tebaklaguPlayed[id] = conn.tebaklaguPlayed[id] || new Set()
        conn.tebaklaguPlayed[id].add(pickedTitle)

        let json = src.find(s => s.judul.toLowerCase().trim() === pickedTitle)
        if (!json) json = src[Math.floor(Math.random() * src.length)]

        let caption = `
┌─⊷ *TEBAK LAGU*
▢ Artist: *${json.artis}*
▢ Timeout: ${(timeout / 1000).toFixed(2)} detik
▢ Bonus: ${poin} XP + $${money}
▢ *Balas soal atau audio untuk menjawab*
└──────────────

Gunakan *${usedPrefix}nafi* untuk hint!
`.trim()

        let msgText = await conn.reply(m.chat, caption, m)
        let msgAudio = await conn.sendMessage(
            m.chat,
            {
                audio: { url: json.lagu },
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            },
            { quoted: m }
        )

        conn.tebaklagu[id] = {
            msgText,
            msgAudio,
            answer: json.judul.toLowerCase().trim(),
            hint: json.judul.replace(/[AIUEOaiueo]/g, '_'),
            exp: poin,
            money,
            timeout: setTimeout(() => {
                if (conn.tebaklagu[id]) {
                    conn.reply(
                        m.chat,
                        `⏳ Waktu habis!\nJawabannya adalah *${json.judul}*`,
                        conn.tebaklagu[id].msgText
                    )
                    delete conn.tebaklagu[id]
                }
            }, timeout)
        }

    } catch (e) {
        console.error(e)
        m.reply('Terjadi kesalahan saat mengambil data. Coba lagi nanti!')
    }
}

handler.before = async function (m, { conn }) {
    let id = m.chat
    if (!conn.tebaklagu || !(id in conn.tebaklagu)) return

    let game = conn.tebaklagu[id]

    if (
        !m.quoted ||
        (m.quoted.id !== game.msgText.key.id &&
            m.quoted.id !== game.msgAudio.key.id)
    ) return

    let userAnswer = m.text.toLowerCase().trim()

    if (userAnswer === game.answer) {
        global.db.data.users[m.sender].exp += game.exp
        global.db.data.users[m.sender].money += game.money
        conn.reply(m.chat, `✅ *Benar!* 🎉\n+${game.exp} XP & +$${game.money} telah ditambahkan!`, m)
        clearTimeout(game.timeout)
        delete conn.tebaklagu[id]
    } else if (similarity(userAnswer, game.answer) >= threshold) {
        return conn.reply(m.chat, '⚠️ *Hampir benar! Coba lagi!*', m)
    } else {
        return conn.reply(m.chat, '❌ *Salah!*', m)
    }
}

handler.help = ['tebaklagu']
handler.tags = ['game']
handler.command = /^tebaklagu|nafi$/i
handler.limit = false
handler.group = true

export default handler
