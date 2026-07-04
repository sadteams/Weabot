
const delay = time => new Promise(res => setTimeout(res, time))

const handler = async (m, { conn }) => {
const data = [
  [
    "62895336282144",
    "𝚃𝚑𝚎.𝚂𝚊𝚍.𝙱𝚘𝚢𝟶𝟷",
    "+62 895-3362-82144",
    "ᴅᴇᴠᴇʟᴏᴩᴇʀ ʙᴏᴛ",
    "the.sad.boy01kangsad@gmail.com",
    "Wibu zone id",
    "https://github.com/Kangsad01",
    "Over Limited"
  ]
]
if (!Array.isArray(data[0]) && typeof data[0] === 'string') data = [data]
let contacts = []
               for (let [number, name, isi, isi1, isi2, isi3, isi4, isi5] of data) {
let vcard = `
BEGIN:VCARD
VERSION:3.0
N:Sy;Bot;;;
FN:${name}
item.ORG:${isi}
item1.TEL;waid=${number}:${isi}
item1.X-ABLabel:${isi1}
item2.EMAIL;type=INTERNET:${isi2}
item2.X-ABLabel:📧 Email
item3.ADR:;;${isi3};;;;
item3.X-ABADR:ac
item3.X-ABLabel:📍 Region
item4.URL:${isi4}
item4.X-ABLabel:Website
item5.X-ABLabel:${isi5}
END:VCARD`.trim()
contacts.push({ vcard})
                }
        conn.p = conn.p ? conn.p : {}
	conn.p[m.chat] = [      
       await conn.sendMessage(m.chat, {
                      contacts: {
                        contacts,
displayName: `100 kontak`,
                       }
                }, {quoted: m})
                ]
	await delay(100)
  return conn.sendMessage(m.chat, { text: `Hay kak @${m.sender.split('@')[0]}, itu nomor ownerku jangan dispam yah ^_^`, mentions: [m.sender] }, { quoted: conn.p[m.chat][0]
  })
  await delay(100)
  return delete conn.p[m.chat]
};
handler.help    = ['owner'];
handler.tags    = ['info'];
handler.command = /^(owner|creator|pemilik)$/i;
export default handler;