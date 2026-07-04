import fetch from 'node-fetch';
import { FormData, Blob } from 'formdata-node';
import { JSDOM } from 'jsdom';

async function webp2mp4(source) {
  let form = new FormData()
  let isUrl = typeof source === 'string' && /https?:\/\//.test(source)
  const blob = !isUrl && new Blob([source])
  form.append('new-image-url', isUrl ? blob : '')
  form.append('new-image', isUrl ? '' : blob, 'image.webp')
  let res = await fetch('https://ezgif.com/webp-to-mp4', {
    method: 'POST',
    body: form
  })
  let html = await res.text()
  let { document } = new JSDOM(html).window
  let form2 = new FormData()
  let obj = {}
  for (let input of document.querySelectorAll('form input[name]')) {
    obj[input.name] = input.value
    form2.append(input.name, input.value)
  }

  // Guard: upload step gagal
  if (!obj.file) throw new Error('webp2mp4: Upload gagal — ezgif tidak mengembalikan file token')

  let res2 = await fetch('https://ezgif.com/webp-to-mp4/' + obj.file, {
    method: 'POST',
    body: form2
  })
  let html2 = await res2.text()
  let { document: document2 } = new JSDOM(html2).window

  // Fallback selector bertahap
  const videoEl =
    document2.querySelector('div#output > p.outfile > video > source') ||
    document2.querySelector('#output video source') ||
    document2.querySelector('video source')

  if (!videoEl?.src) throw new Error('webp2mp4: Konversi gagal — ezgif tidak mengembalikan output video')

  return new URL(videoEl.src, res2.url).toString()
}

async function webp2png(source) {
  let form = new FormData()
  let isUrl = typeof source === 'string' && /https?:\/\//.test(source)
  const blob = !isUrl && new Blob([source])
  form.append('new-image-url', isUrl ? blob : '')
  form.append('new-image', isUrl ? '' : blob, 'image.webp')
  let res = await fetch('https://ezgif.com/webp-to-png', {
    method: 'POST',
    body: form
  })
  let html = await res.text()
  let { document } = new JSDOM(html).window
  let form2 = new FormData()
  let obj = {}
  for (let input of document.querySelectorAll('form input[name]')) {
    obj[input.name] = input.value
    form2.append(input.name, input.value)
  }

  // Guard: upload step gagal
  if (!obj.file) throw new Error('webp2png: Upload gagal — ezgif tidak mengembalikan file token')

  let res2 = await fetch('https://ezgif.com/webp-to-png/' + obj.file, {
    method: 'POST',
    body: form2
  })
  let html2 = await res2.text()
  let { document: document2 } = new JSDOM(html2).window

  // Fallback selector bertahap
  const imgEl =
    document2.querySelector('div#output > p.outfile > img') ||
    document2.querySelector('#output img') ||
    document2.querySelector('img[src*=".png"]')

  if (!imgEl?.src) throw new Error('webp2png: Konversi gagal — ezgif tidak mengembalikan output gambar')

  return new URL(imgEl.src, res2.url).toString()
}

export { webp2mp4, webp2png }