import speedTest from 'speedtest-net'
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

let handler = async (m, { conn }) => {
    let msg = await m.reply('🚀 *Menjalankan Speedtest...*\nTunggu 45-60 detik ya')

    try {
        // Versi baru pake await, bukan .on
        const result = await speedTest({
            acceptLicense: true,
            acceptGdpr: true,
            maxTime: 60000
        })
        // Convert bandwidth ke Mbps
        let download = (result.download.bandwidth * 8 / 1000000).toFixed(2)
        let upload = (result.upload.bandwidth * 8 / 1000000).toFixed(2)

        let teks = `*📊 HASIL SPEEDTEST*\n\n` +
        `*Server* : ${result.server.name}\n` +
        `*Lokasi* : ${result.server.location}, ${result.server.country}\n` +
        `*Sponsor* : ${result.server.sponsor || 'Tidak Diketahui'}\n` +
        `*Ping* : ${result.ping.latency} ms\n` +
        `*Jitter* : ${result.ping.jitter} ms\n\n` +
        `*Download* : ${download} Mbps\n` +
        `*Upload* : ${upload} Mbps\n` +
        `*ISP* : ${result.isp}\n\n` +
        `*Link Hasil* : ${result.result.url}`


const imgUrl = "https://cdn.discordapp.com/attachments/1523298870220816597/1524359781601644685/file.jpg?ex=6a4f762d&is=6a4e24ad&hm=8faa35416c6812a97d4f477ac429cbb284fe1f1616ff7223fa76e8ab29c15015& "

conn.relayMessage(m.chat, {
      interactiveMessage: {
        header: {
          hasMediaAttachment: true,
          locationMessage: {
            degreesLatitude: 0,
            degreesLongitude: 0,
            name: global.namebot,
            address: 'Speedtest by Ookla',
            jpegThumbnail: (await resize(imgUrl, 300, 300)).toString('base64')
          }
        },
        body: { text: teks},
        footer: { text: global.wm || 'Bot' },
        nativeFlowMessage: {
          buttons: [
            {
              name: 'single_select',
              buttonParamsJson: JSON.stringify({
                title: 'Pilih Kategori',
                sections: [{ // bisa 1 section atau lebih
         title: '✨ Pilihan 1',
         rows: [{ header: '', title: '📶 Ping', id: '#ping' }]
      }, {
         title: '✨ Pilihan 2',
         highlight_label: '🔥 Popular', // label kuning
         rows: [{ title: '📂 Menu', id: '#menu' }]
      }],})
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
    } catch (e) {
        await m.reply('❌ Gagal: ' + e.message)
    }
}
handler.help = ['speedtest']
handler.tags = ['tools']
handler.command = /^(speedtest|speed)$/i

export default handler