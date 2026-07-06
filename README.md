# VanitasMd

Dokumentasi ringkas penggunaan helper pesan yang tersedia di object `conn`. Semua contoh di bawah diasumsikan dipakai dari dalam plugin handler:

```js
let handler = async (m, { conn, text, usedPrefix, command }) => {
  // gunakan helper conn di sini
}

export default handler
```

## Helper Dasar

### Reply teks

```js
await conn.reply(m.chat, 'Halo dunia', m)
await conn.sendText(m.chat, 'Halo dunia', m)
```

Dengan mention:

```js
await conn.reply(m.chat, 'Halo @user', m, {
  mentions: ['628xxxx@s.whatsapp.net']
})
```

### React pesan

```js
await m.react('✅')
await m.react('⏳')
await m.react('❌')
```

### Hapus pesan

```js
await m.delete()
```

## Helper Media

`source` bisa berupa `Buffer`, URL, path file lokal, atau object `{ url }`.

### Kirim file otomatis

`conn.sendFile` akan mendeteksi mime dan mengirim sebagai image, video, audio, sticker, atau document sesuai opsi.

```js
await conn.sendFile(m.chat, source, 'file.jpg', 'Caption', m)
```

### Kirim image

```js
await conn.sendImage(m.chat, imageUrlOrBuffer, 'Caption image', m)
```

### Kirim video

```js
await conn.sendVideo(m.chat, videoUrlOrBuffer, 'Caption video', m)
```

### Kirim audio

```js
await conn.sendAudio(m.chat, audioUrlOrBuffer, m)
```

### Kirim voice note / PTT

```js
await conn.sendPTT(m.chat, audioUrlOrBuffer, m)
```

### Kirim dokumen

```js
await conn.sendDocument(
  m.chat,
  fileUrlOrBuffer,
  'application/pdf',
  'dokumen.pdf',
  'Caption dokumen',
  m
)
```

### Kirim sticker

```js
await conn.sendSticker(m.chat, imageOrWebpOrVideo, m)
```

Dengan metadata sticker:

```js
await conn.sendSticker(m.chat, imageOrVideo, m, {
  sticker: {
    packname: 'Vanitas',
    author: 'Bot'
  }
})
```

Alias sticker:

```js
await conn.sendImageAsSticker(m.chat, image, m)
await conn.sendVideoAsSticker(m.chat, video, m)
```

## Helper Buffer dan Resize

### Ambil buffer

```js
const buffer = await conn.getBuffer('https://example.com/image.jpg')
```

### Ambil info file

```js
const file = await conn.getFile(buffer)
console.log(file.mime, file.ext, file.size)
```

### Resize gambar dengan Jimp

`conn.resize` memakai Jimp dan menghasilkan Buffer JPEG.

```js
const thumbnail = await conn.resize(imageUrlOrBufferOrPath, 100, 100)
```

Biasa dipakai untuk thumbnail button:

```js
await conn.sendButton(
  m.chat,
  'Halo dunia',
  'Footer Message',
  await conn.resize(imageUrl, 100, 100),
  [['Menu', '.menu']],
  m
)
```

## Helper Button

### Button biasa

`conn.sendButton` memakai format `buttonsMessage` dengan `locationMessage`, `headerType: 6`, dan `additionalNodes` native flow.

Format:

```js
await conn.sendButton(jid, text, footer, thumbnail, buttons, quoted, options)
```

Contoh:

```js
await conn.sendButton(
  m.chat,
  'Halo dunia',
  'Footer Message',
  await conn.resize('https://example.com/thumb.jpg', 100, 100),
  [
    ['Menu', '.menu'],
    ['Ping', '.ping']
  ],
  m,
  {
    name: 'Vanitas',
    address: 'Buttons Message'
  }
)
```

Format button object juga bisa:

```js
await conn.sendButton(m.chat, 'Pilih aksi:', 'Footer', null, [
  { text: 'Menu', id: '.menu' },
  { text: 'Ping', id: '.ping' }
], m)
```

Alias:

```js
await conn.sendButtons(m.chat, 'Text', 'Footer', null, [['Menu', '.menu']], m)
await conn.sendButtonText(m.chat, 'Text', 'Footer', null, [['Menu', '.menu']], m)
await conn.sendHydrated(m.chat, 'Text', 'Footer', null, [['Menu', '.menu']], m)
```

### Button V2

`sendButtonV2` memakai `buttonsMessage` versi builder dari `baileys-mbuilder`.

```js
await conn.sendButtonV2(
  m.chat,
  'Pilih menu:',
  'Footer Message',
  [
    ['Menu', '.menu'],
    ['Ping', '.ping']
  ],
  m,
  {
    title: 'Vanitas',
    subtitle: 'Buttons Message'
  }
)
```

## Helper Button List

`conn.sendButtonList` memakai native flow `interactiveMessage` dengan `single_select`.

Format:

```js
await conn.sendButtonList(jid, text, footer, thumbnail, sections, quoted, options)
```

Contoh:

```js
await conn.sendButtonList(
  m.chat,
  'Silakan pilih menu:',
  'Footer Message',
  null,
  [
    {
      title: 'Main Menu',
      rows: [
        ['Ping', '.ping', 'Cek kecepatan bot'],
        ['Menu', '.menu', 'Lihat semua fitur']
      ]
    },
    {
      title: 'Tools',
      rows: [
        ['Translate', '.translate hello', 'Terjemahkan teks'],
        ['Sticker', '.sticker', 'Buat sticker dari media']
      ]
    }
  ],
  m,
  {
    title: 'Pilih Menu'
  }
)
```

Format row object:

```js
await conn.sendButtonList(m.chat, 'Pilih fitur:', 'Footer', null, [
  {
    title: 'Downloader',
    rows: [
      {
        title: 'Instagram',
        id: '.instagram https://instagram.com/reel/xxxxx',
        description: 'Download video Instagram'
      },
      {
        title: 'TikTok',
        id: '.tiktok https://tiktok.com/xxxxx',
        description: 'Download video TikTok'
      }
    ]
  }
], m)
```

Alias:

```js
await conn.sendList(m.chat, 'Text', 'Footer', null, sections, m)
```

## Helper Interactive Native Flow

Untuk quick reply, URL, copy, call, dan list custom.

```js
await conn.sendInteractive(
  m.chat,
  'Pilih salah satu:',
  'Footer Message',
  null,
  [
    ['Menu', '.menu'],
    { text: 'Website', url: 'https://example.com' },
    { text: 'Salin Kode', copy: 'ABC123' }
  ],
  m
)
```

Dengan list section:

```js
await conn.sendInteractive(
  m.chat,
  'Pilih menu:',
  'Footer',
  null,
  [['Ping', '.ping']],
  m,
  {
    title: 'Daftar Menu',
    sections: [
      {
        title: 'Main',
        rows: [
          ['Menu', '.menu', 'Lihat menu'],
          ['Ping', '.ping', 'Cek speed']
        ]
      }
    ]
  }
)
```

## Helper AI Rich

`conn.aiRich` adalah alias dari `conn.sendAIRich`. Helper ini memakai `baileys-mbuilder` untuk mengirim rich response AI.

### Teks rich biasa

```js
await conn.aiRich(
  m.chat,
  'Halo, ini teks AI rich dengan [link](https://example.com)',
  m
)
```

### Teks plus code block

```js
await conn.aiRich(m.chat, [
  { type: 'text', text: 'Ini contoh penjelasan.' },
  { type: 'code', language: 'js', code: 'console.log("halo")' }
], m)
```

### Tabel

```js
await conn.aiRich(m.chat, [
  { type: 'text', text: 'Ringkasan data:' },
  {
    type: 'table',
    table: [
      ['Nama', 'Role'],
      ['Vania', 'AI Assistant'],
      ['Owner', 'Admin Bot']
    ]
  }
], m)
```

### Source / referensi

```js
await conn.aiRich(m.chat, [
  { type: 'text', text: 'Aku menemukan referensi ini:' },
  {
    type: 'source',
    sources: [
      ['https://example.com/favicon.ico', 'https://example.com', 'Example']
    ]
  }
], m)
```

## Helper Carousel

`conn.sendCarousel` memakai `baileys-mbuilder` dan setiap card wajib punya image/video/document.

```js
await conn.sendCarousel(
  m.chat,
  [
    {
      image: 'https://example.com/image-1.jpg',
      title: 'Menu Utama',
      text: 'Lihat semua fitur bot',
      buttons: [['Buka Menu', '.menu']]
    },
    {
      image: 'https://example.com/image-2.jpg',
      title: 'Ping',
      text: 'Cek kecepatan bot',
      buttons: [['Cek Ping', '.ping']]
    }
  ],
  m,
  {
    text: 'Daftar pilihan',
    footer: 'Footer Message'
  }
)
```

## Helper Contact

```js
await conn.sendContact(m.chat, ['6281234567890'], m)
```

Dengan nama:

```js
await conn.sendContact(m.chat, [
  ['6281234567890', 'Owner Bot'],
  ['6289876543210', 'Admin Bot']
], m)
```

## Membaca Response Button

Response tombol dan list otomatis masuk ke serialize:

```js
console.log(m.text)       // id tombol, contoh: .menu
console.log(m.buttonId)   // id tombol jika pesan adalah response button
console.log(m.isButtonResponse) // true jika pesan berasal dari tombol/list
```

Karena `m.text` berisi id tombol, command seperti `.menu` atau `.ping` bisa langsung diproses handler.

## Catatan Upload Media Besar

`conn.sendMessage` sudah dibungkus agar URL media besar lebih aman. Jika file terlalu besar atau ruang disk tidak cukup, bot akan mengirim fallback link agar runtime tidak crash karena `ENOSPC`.

```js
await conn.sendMessage(m.chat, {
  document: { url: videoUrl },
  mimetype: 'video/mp4',
  fileName: 'video.mp4',
  caption: 'Video berhasil ditemukan'
}, { quoted: m })
```
