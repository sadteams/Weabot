import nexray from 'api-nexray';

export const platformPatterns = { //
  youtube: /(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?.*v=))([A-Za-z0-9_-]{11})/i,
  instagram: /(?:https?:\/\/)?(?:www\.|m\.|l\.)?instagram\.com\/(?:p|reel|tv|share)\/[^\s]+/i,
  tiktok: /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/i,
  facebook: /(?:https?:\/\/)?(?:www\.|m\.|web\.)?facebook\.com\/[^\s]+|https?:\/\/fb\.watch\/[^\s]+/i,
  threads: /(?:https?:\/\/)?(?:www\.|m\.)?threads\.net\/[^\s]+/i,
  twitter: /(?:https?:\/\/)?(?:www\.|m\.|x\.com|twitter\.com)\/[^\s]+\/status\/[^\s]+/i,
  capcut: /(?:https?:\/\/)?(?:www\.|m\.)?capcut\.com\/[^\s]+/i,
  pinterest: /(?:https?:\/\/)?(?:www\.|id\.)?(?:pin\.it\/[^\s]+|pinterest\.(?:com|co\.id)\/pin\/[^\s]+)/i,
};

const platformEndpoint = {
  instagram: 'instagram',
  tiktok: 'tiktok',
  facebook: 'facebook',
  capcut: 'v1/capcut',
  douyin: 'v1/douyin',
  spotify: 'v1/spotify',
  youtube: 'v1/ytmp4',
  pinterest: 'pinterest', //
};

export function getPlatform(url) {
  if (!url || typeof url!== 'string') return { platform: 'aio' };
  const u = url.trim();

  const ytMatch = u.match(platformPatterns.youtube);
  if (ytMatch) return { platform: 'youtube', id: ytMatch[1] || null };

  if (platformPatterns.instagram.test(u)) return { platform: 'instagram' };
  if (platformPatterns.facebook.test(u)) return { platform: 'facebook' };
  if (platformPatterns.tiktok.test(u)) return { platform: 'tiktok' };
  if (platformPatterns.capcut.test(u)) return { platform: 'capcut' };
  if (platformPatterns.pinterest.test(u)) return { platform: 'pinterest' };
  if (platformPatterns.threads.test(u)) return { platform: 'threads' };
  if (platformPatterns.twitter.test(u)) return { platform: 'twitter' };

  return { platform: 'aio' };
}

export async function download(query) {
  const { platform, id } = getPlatform(query);
  const endpoint = platformEndpoint[platform] || platform;
  console.log('[PLATFORM DETECT]:', platform, 'URL:', query)

  try {
    const response = await nexray.get(`/downloader/${endpoint}`, { "url": query });
    return response.data || response;
  } catch (error) {
    console.log(error);
    throw error;
  }
}


export async function screenshot(query) {
  try {
    const response = await nexray.get('/tools/ssweb', {
      params: { // FIX: pakai params
        url: query, 
        width: "1080", 
        height: "1920",
        device_scale: "2"
      }
    });
    return response;
  } catch (error) {
      console.log(error);
    return error;
  }
}

export async function ytplay(query) {
  try {
    const response = await nexray.get('/downloader/ytplay', { "q": query });
    return response;
  } catch (error) {
    throw new Error(error?.response?.data?.message || error.message);
  }
}

export async function ytmp4(url) {
  
    // 1. Ambil ID YT doang, buang?si= &t= dll
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/i);
    if (!ytMatch) throw new Error('URL YouTube tidak valid');


const qualities = ['720', '480', '360'];
      let data = null;
for ( const res of qualities) {
    try {
    const response = await nexray.get('/downloader/v1/ytmp4', { 
      "url": url,
      "resolusi": res // kirim yg udah bersih
    });
     data = response.data || response;
    if (data?.result?.url || data?.result) { // ketemu link
      console.log(`Berhasil di resolusi: ${res}p`);
      return response; // stop loop
    }
  } catch (e) {
    console.log(`Gagal ${res}p, coba turun...`);

  }
}
      throw new Error('semua resolusi gagal')
}

export async function ytmp3(url) {
  try {
    // 1. Ambil ID YT doang, buang?si= &t= dll
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/i);
    if (!ytMatch) throw new Error('URL YouTube tidak valid');
    const videoId = ytMatch[1];
    const cleanUrl = `https://youtu.be/${videoId}`; // pakai format bersih

    const response = await nexray.get('/downloader/v1/ytmp3', { 
      "url": cleanUrl// kirim yg udah bersih
    });
    return response;
  } catch (error) {
      console.log(error);
    return error;
  }
}
// sisanya sama...