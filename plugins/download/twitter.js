import axios from 'axios';
import { URLSearchParams, fileURLToPath } from 'url';
import { default as ffmpeg } from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
const cheerio = await import('cheerio');
import fetch from 'node-fetch'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMP_DIR = path.join(__dirname, '../../tmp');

if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function gifToMp4(fileUrl) {
    const tmpDir = TMP_DIR;

    try {
        const oldFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith('tmp_'));
        for (const f of oldFiles) {
            try { fs.unlinkSync(path.join(tmpDir, f)); } catch {}
        }
    } catch {}

    const ts = Date.now();
    const tmpInput = path.join(tmpDir, `tmp_in_${ts}.mp4`);
    const tmpOutput = path.join(tmpDir, `tmp_out_${ts}.mp4`);

    const dlRes = await axios.get(fileUrl, {
        responseType: 'stream',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        }
    });

    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tmpInput);
        dlRes.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });

    if (!fs.existsSync(tmpInput) || fs.statSync(tmpInput).size === 0) {
        throw new Error('Download gagal, file input kosong');
    }

    console.log('Input size:', fs.statSync(tmpInput).size, 'bytes');
    console.log('Output path:', tmpOutput);

    await new Promise((resolve, reject) => {
        ffmpeg(tmpInput)
            .outputOptions([
                '-movflags faststart',
                '-pix_fmt yuv420p',
                '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
            ])
            .toFormat('mp4')
            .output(tmpOutput)
            .on('start', cmd => console.log('ffmpeg cmd:', cmd))
            .on('end', () => {
                console.log('ffmpeg selesai, output:', tmpOutput);
                resolve();
            })
            .on('error', (err, stdout, stderr) => {
                console.error('ffmpeg stderr:', stderr);
                reject(new Error(`ffmpeg error: ${err.message}\n${stderr}`));
            })
            .run();
    });

    if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);

    if (!fs.existsSync(tmpOutput) || fs.statSync(tmpOutput).size === 0) {
        throw new Error('Konversi gagal, file output kosong atau tidak ditemukan');
    }

    return tmpOutput;
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let txt = isLink(text);
    if (!text && txt === null) return await conn.reply(m.chat, `Please enter a Twitter video/image link.\n> Example: ${usedPrefix + command} https://x.com/somevideo`, m);
    let input = txt ? txt[0] : text;

    conn.twitter = conn.twitter ? conn.twitter : {};
         
    let twitterData = await twitter(input);
    let videoUrls = twitterData.videoUrls || [];
    if (twitterData.type === 'gif') {
        videoUrls.unshift({
            type: 'GIF',
            quality: 'GIF format',
            link: [twitterData.gif]
        });
        if (twitterData.image) {
            videoUrls.push({
                type: 'JPG',
                quality: 'Image',
                link: [twitterData.image]
            });
        }
    }
    
    if (videoUrls.length === 0) {
        return await conn.reply(m.chat, `Sorry, no downloadable content was found at the provided link.`, m);
    }

    const twitterMediaData = videoUrls.map((item, index) => `*_${index + 1}. ${item.type} - ${item.quality}_*`).join('\n');
    await conn.reply(m.chat, `Please select the video / image / audio you want by typing the number: \n${twitterMediaData}`, m);
    
    let allLinks = videoUrls.map(v => v.link);
    return conn.twitter[m.sender] = {
        url: input,
        caption: twitterData.description,
        allLinks,
        isGif: twitterData.type === 'gif',
        timeout: setTimeout(() => {
            delete conn.twitter[m.sender];
        }, 160000)
    };
};

handler.before = async (m, { conn }) => {
    conn.twitter = conn.twitter ? conn.twitter : {};
    if (!m.sender in conn.twitter) {
        return;
    } else if (m.sender in await conn.twitter) {
        const { url, caption, allLinks, timeout, isGif } = conn.twitter[m.sender];
        let input = m.text.match(/\d+/g);

        if (!input) {
            return;
        } else {
            try {
                let index = parseInt(input) - 1;
                if (index >= 0 && index < allLinks.length) {
                    await conn.reply(m.chat, "[ ⏳ ] Please wait...", m, { ephemeralExpiration: 86400 });

                    let downloadLink = allLinks[index];
                    let isSelectedGif = (index === 0 && isGif);
                    
                    for (let i of downloadLink) {
                        if (isSelectedGif) {
                            const tmpPath = await gifToMp4(i);
                            try {
                                await conn.sendMessage(m.chat, {
                                    video: fs.readFileSync(tmpPath),
                                    gifPlayback: true,
                                    caption: `- *Caption :* \n${caption}`
                                }, { quoted: m });
                            } finally {
                                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                            }
                        } else {
                            const ext = i.includes('.mp3') ? 'mp3' : i.includes('.jpg') || i.includes('.jpeg') ? 'jpg' : 'mp4';
                            if (ext === 'mp3') {
                                await conn.sendMessage(m.chat, {
                                    audio: { url: i },
                                    mimetype: 'audio/mpeg',
                                    caption: `- *Caption :* \n${caption}`
                                }, { quoted: m });
                            } else if (ext === 'jpg') {
                                await conn.sendMessage(m.chat, {
                                    image: { url: i },
                                    caption: `- *Caption :* \n${caption}`
                                }, { quoted: m });
                            } else {
                                await conn.sendMessage(m.chat, {
                                    video: { url: i },
                                    caption: `- *Caption :* \n${caption}`
                                }, { quoted: m });
                            }
                        }
                        clearTimeout(timeout);
                        delete conn.twitter[m.sender];
                    }
                } else {
                    await conn.reply(m.chat, `Please choose a valid number from the options provided.`, m, { ephemeralExpiration: 86400 });
                }
            } catch (e) {
                console.error(e);
                m.error = e
                await conn.reply(m.chat, `⚠️ Error: ${e.message}`, m);
                clearTimeout(timeout);
                delete conn.twitter[m.sender];
            }
        }
    }
};

handler.help = ['twitter', 'x'].map(v => v + ' <url>');
handler.tags = ['downloader'];
handler.command = ["twitter", "x"];
handler.limit = 1;
export default handler;

function isLink(text) {
    let pattern = /https?:\/\/\S+/gi;
    let links = text.match(pattern);
    return links;
}

async function twitter(url) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const urls = await url.match(urlPattern);
  if (!urls) throw "No URL found.";

  try {
    const res = await axios({
      method: 'POST',
      url: 'https://savetwitter.net/api/ajaxSearch',
      data: new URLSearchParams({
        q: urls[0],
        lang: 'id',
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': '*/*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const result = res.data;
    const $ = cheerio.load(result.data);
    const twitterId = $('#TwitterId').attr('value');
    const mp3Link = $("a[data-audiourl]").attr("data-audiourl");

    const usernameIndex = url.indexOf('.com/') + 5;
    const usernameEndIndex = url.indexOf('/status/');
    const nickname = url.substring(usernameIndex, usernameEndIndex);

    const kexp = $('script').filter(function () {
      return $(this).html().includes('k_exp');
    }).html().match(/k_exp\s*=\s*"([^"]*)"/)[1];

    const ktoken = $('script').filter(function () {
      return $(this).html().includes('k_token');
    }).html().match(/k_token\s*=\s*"([^"]*)"/)[1];

    const links = [];

    const gifElement = $('.dl-action a').filter((i, el) => $(el).text().includes('Unduh MP4 (gif)'));
    const gifUrl = gifElement.attr('href');

    const imageUrl = $('.dl-action a').filter((i, el) => $(el).text().toLowerCase().includes('unduh gambar')).attr('href');

    const thumbnail = $('.thumbnail .image-tw img').attr('src');

    if (gifUrl) {
      return {
        username: nickname,
        description: $('h3').text().trim(),
        type: 'gif',
        thumbnail,
        gif: gifUrl,
        image: imageUrl || null
      };
    }

    $('a').each(function () {
      const text = $(this).text();
      const href = $(this).attr('href');
      if (text.includes('Unduh MP4')) {
        const quality = text.match(/\((\d+p)\)/);
        links.push({ type: 'MP4', quality: quality ? quality[1] : 'Unknown', link: [href] });
      }
    });

    const news = [];
    $('img').each(function () {
      const src = $(this).attr('src');
      if (src) {
        news.push({ type: 'JPG', quality: 'Image', link: src });
      }
    });
    const linksArray = news.map(video => video.link);
    links.push({ type: 'JPG', quality: 'Image', link: linksArray });

    if (mp3Link) {
      const resps = await axios({
        method: 'POST',
        url: 'https://s1.twcdn.net/api/json/convert',
        data: new URLSearchParams({
          ftype: 'mp3',
          v_id: twitterId,
          audioUrl: mp3Link,
          audioType: 'audio/mp4',
          fquality: '320',
          fname: 'SaveTwitter.Net',
          exp: kexp,
          token: ktoken,
        }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': '*/*',
        },
      });

      if (resps.data.result !== 'Converting') {
        links.push({ type: 'MP3', quality: '320kbps', link: [await resps.data.result] });
      }
    }

    return {
      username: nickname,
      description: $('h3').text().trim(),
      thumbnail: $('a[onclick="showAd()"]').attr('href'),
      videoUrls: links,
    };

  } catch (error) {
    if (error.message.includes('cheerio.load() expects a string')) {
      throw 'Oops! The URL seems to be invalid. Please make sure it starts with https://x.com or https://twitter.com and try again.';
    } else {
      throw `Terjadi kesalahan: ${error.message}`;
    }
  }
}
