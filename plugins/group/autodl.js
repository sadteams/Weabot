let handler = async (m, { conn, args, isAdmin }) => {
    if (!m.isGroup) return m.reply('❌ Command ini hanya untuk grup')
    if (!isAdmin) return m.reply('❌ Khusus admin grup')

    let chat = db.data.chats[m.chat]

    if (!args[0]) {
        return m.reply(`Status Auto Download: ${chat.autodownload? 'ON ✅' : 'OFF ❌'}\n\nContoh:\n*.autodownload on*\n*.autodownload off*`)
    }

    if (args[0] === 'on') {
        chat.autodownload = true
        m.reply('✅ Auto Download dinyalakan')
    } else if (args[0] === 'off') {
        chat.autodownload = false
        m.reply('❌ Auto Download dimatikan')
    } else {
        m.reply('Perintah salah. Gunakan: on / off')
    }
}

handler.help = ['autodownload <on/off>']
handler.tags = ['group']
handler.command = /^autodownload|autodl$/i // PENTING: regex biar pas

export default handler