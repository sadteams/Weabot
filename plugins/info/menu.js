import moment from 'moment-timezone'
import { Jimp } from 'jimp'
import fetch from 'node-fetch'

const resize = async(url, w, h) => {
  try {
    const res = await fetch(url)
    const buffer = await res.buffer()
    const img = await Jimp.fromBuffer(buffer, { mime: 'image/jpeg' })
    img.resize({ w, h }) 
    return await img.getBuffer('image/jpeg')
  } catch (e) {
    console.log('Resize error: ' + e)
    return Buffer.alloc(0) // kirim buffer kosong biar thumbnail ilang doang, bot gak crash
  }
}
const handler = async (m, { conn, usedPrefix: _p, command }) => {
  const time = moment.tz('Asia/Jakarta').format('HH:mm:ss')
  const date = new Date().toLocaleDateString('id-ID')
  
  const uptime = process.uptime()
  const h = Math.floor(uptime / 3600)
  const mnt = Math.floor((uptime % 3600) / 60)
  const s = Math.floor(uptime % 60)

  const name = await conn.getName(m.sender).catch(() => 'User')
  const imgUrl = 'https://i.pinimg.com/736x/74/5c/8e/745c8e50c26d7d11166a792907b75203.jpg'
  const readMore = '\u200e'.repeat(4001)

  const tags = {}
  for (let p in global.plugins) {
    let plugin = global.plugins[p]
    if (!plugin?.tags?.length ||!plugin?.help) continue
    if (plugin.disabled) continue
    for (let t of plugin.tags) {
      if (!tags[t]) tags[t] = []// FIX: buka ini biar gak error push
      tags[t].push(plugin)
    }
  }

  const args = (m.text.split(' ')[1] || '').toLowerCase()
  
  if (!args) {
    const kategori = Object.keys(tags).sort().map(v => 
      `• ${_p}menu ${v} | ${v.toUpperCase()}`
    ).join('\n')

    const teks = `┏━━━ꕥ〔 *${global.namebot || 'Bot'}* 〕ꕥ━⬣
┃ 
┃ ✾ Hai, ${name}! 
┃ *Waktu :* ${time}
┃ *Tanggal:* ${date}
┃ *Uptime :* ${h}j ${mnt}m ${s}s
┗━━━━━━ꕥ 
${readMore}
*LIST KATEGORI*
${kategori}

Ketik: ${_p}menu <kategori> | ${_p}menu all`

    const rows = Object.keys(tags).sort().map(v => ({
      header: `• ${v.charAt(0).toUpperCase() + v.slice(1)}`,
      title: `Menu ${v}`,
      description: `${tags[v].length} command`,
      id: `${_p + command} ${v}`
    }));
    
    // FIX: Tambahin "Menu All" paling atas
    rows.unshift({
      header: `📦 ALL`,
      title: `Semua Menu`,
      description: 'Lihat semua command bot',
      id: `${_p + command} all`
    })

    return conn.relayMessage(m.chat, {
      interactiveMessage: {
        header: {
          hasMediaAttachment: true,
          locationMessage: {
            degreesLatitude: 0,
            degreesLongitude: 0,
            name: global.namebot,
            address: 'Silakan pilih kategori menu di bawah ini.',
            jpegThumbnail: (await resize(imgUrl, 300, 300)).toString('base64')
          }
        },
        body: { text: teks },
        footer: { text: global.wm || 'Bot' },
        nativeFlowMessage: {
          buttons: [
            {
              name: 'single_select',
              buttonParamsJson: JSON.stringify({
                title: 'Pilih Kategori',
                sections: [
                  {
                    title: 'Main Menu',
                    rows // <- udah ada "all" di index 0
                  }
                ]
              })
            }
          ]
        },
        contextInfo: { 
          quotedMessage: {
            conversation: "Menu Bot",
            messageContextInfo: {
              threadId: [],
              messageSecret: "iWcBlEkQRwMgUO8h4XDTPPdNW7t3QieU27wXS23Pm60=",
              limitSharingV2: { sharingLimited: false, trigger: 1, limitSharingSettingTimestamp: 1778672733494, initiatedByMe: false }
            }
          },
          mentionedJid: [],
          groupMentions: [],
          statusAttributions: []
        }
      }
    }, { 
      quoted: m, 
      additionalNodes: [{
        tag: 'biz',
        attrs: {},
        content: [{
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
        }]
      }]
    })
  }

  if (args === 'all') {
    let teks = `┏━━━ꕥ〔 *ALL MENU* 〕ꕥ━⬣\n${readMore}\n`
    for (let tag of Object.keys(tags).sort()) {
      teks += `*${tag.toUpperCase()}*\n`
      for (let p of tags[tag]) {
        const help = Array.isArray(p.help)? p.help[0] : p.help
        const prem = p.premium? ' Ⓟ' : ''
        const limit = p.limit? ' Ⓛ' : ''
        teks += `╰ ${_p}${help}${prem}${limit}\n`
      }
      teks += '\n'
    }
    return conn.sendMessage(m.chat, { text: teks.trim() }, { quoted: m })
  }

  if (!tags[args]) return m.reply(`❌ Kategori *${args}* tidak ada.\nKetik ${_p}menu untuk lihat list.`)
  
  let teks = `*MENU ${args.toUpperCase()}*\n\n`
  for (let p of tags[args]) {
    const help = Array.isArray(p.help)? p.help[0] : p.help
    const prem = p.premium? ' Ⓟ' : ''
    const limit = p.limit? ' Ⓛ' : ''
    teks += `╰ ${_p}${help}${prem}${limit}\n`
  }
  return conn.sendMessage(m.chat, { text: teks.trim() }, { quoted: m })
}

handler.help = ['menu', 'help']
handler.tags = ['info']
handler.command = /^(menu|help|start)$/i

export default handler
