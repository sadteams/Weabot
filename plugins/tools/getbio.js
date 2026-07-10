let handler = async (m, { conn }) => {
  let who
  try {
    if (m.isGroup) {
      who = m.mentionedJid[0]? m.mentionedJid[0] : m.quoted?.sender || m.sender
    } else {
      who = m.quoted?.sender || m.sender
    }

    let bio = await conn.fetchStatus(who).catch(() => null)

    if (!bio ||!bio.status) {
      return m.reply(`*Bio kosong atau di private*`)
    }

    let teks = `*📝 BIO ${who.split('@')[0]}*\n\n${bio.status}\n\n*Last Update* : ${new Date(bio.setAt * 1000).toLocaleString('id-ID')}`
    m.reply(teks)

  } catch (e) {
    m.reply(`❌ Gagal: ${e.message}`)
  }
}

handler.help = ['getbio <@tag/reply>']
handler.tags = ['tools']
handler.command = /^(getb?io)$/i

export default handler