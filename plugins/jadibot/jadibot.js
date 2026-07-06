import { startJadibot, getJadibotSession, deleteJadibotSession } from '../../lib/jadibot-manager.js';
import { pending, ttl, keyOf, normalizeText, normalizePhone, formatTime } from './_shared.js';

function sessionStatus(session) {
  if (!session) return '-';
  return session.active ? 'aktif' : (session.status || 'off');
}

async function askExisting(conn, m, session) {
  const sent = await conn.sendMessage(m.chat, {
    text: [
      '*Session Jadibot Ditemukan*',
      `ID Session: ${session.id}`,
      `Status: ${sessionStatus(session)}`,
      `Nomor login: ${session.phone || '-'}`,
      `Akun: ${session.jid || '-'}`,
      `Update: ${formatTime(session.updatedAt)}`,
      '',
      'Balas pesan ini dengan pilihan:',
      '1. Gunakan session sebelumnya',
      '2. Hapus session dan login nomor baru',
      '',
      'Ketik batal untuk membatalkan.'
    ].join('\n')
  }, { quoted: m });

  pending.set(keyOf(m), {
    step: 'existing',
    sessionId: session.id,
    messageId: sent?.key?.id,
    expires: Date.now() + ttl,
  });
}

async function askMode(conn, m, extra = {}) {
  const sent = await conn.sendMessage(m.chat, {
    text: [
      '*Jadibot Login*',
      'Balas pesan ini dengan pilihan mode login:',
      '',
      '1. QR',
      '2. Pairing Code',
      '',
      'Ketik batal untuk membatalkan.'
    ].join('\n')
  }, { quoted: m });

  pending.set(keyOf(m), {
    step: 'mode',
    messageId: sent?.key?.id,
    expires: Date.now() + ttl,
    ...extra,
  });
}

async function askPhone(conn, m, state) {
  const sent = await conn.sendMessage(m.chat, {
    text: [
      '*Pairing Code*',
      'Balas pesan ini dengan nomor WhatsApp yang ingin dijadikan bot.',
      'Contoh: 6281234567890',
      '',
      'Ketik batal untuk membatalkan.'
    ].join('\n')
  }, { quoted: m });

  state.step = 'phone';
  state.messageId = sent?.key?.id;
  state.expires = Date.now() + ttl;
}

async function runStart(conn, m, mode, phone = '', options = {}) {
  await conn.sendMessage(m.chat, { text: 'Menyiapkan session jadibot. Tunggu sebentar...' }, { quoted: m });
  const child = await startJadibot({ parentConn: conn, m, mode, phone, ...options });
  if (options.useExisting && child?.status === 'open') {
    await m.reply('Session jadibot sebelumnya sudah aktif.');
  }
}

const handler = async (m, { conn }) => {
  const existing = getJadibotSession(m.sender, { includeStopped: true });
  if (existing) return askExisting(conn, m, existing);
  await askMode(conn, m);
};

handler.before = async function (m) {
  const state = pending.get(keyOf(m));
  if (!state) return false;
  if (Date.now() > state.expires) {
    pending.delete(keyOf(m));
    await m.reply('Sesi pilihan jadibot expired. Kirim .jadibot lagi.');
    return true;
  }

  if (!m.quoted || m.quoted.id !== state.messageId) return false;

  const text = normalizeText(m.text);
  if (['batal', 'cancel', '0'].includes(text)) {
    pending.delete(keyOf(m));
    await m.reply('Pembuatan jadibot dibatalkan.');
    return true;
  }

  try {
    if (state.step === 'existing') {
      if (['1', 'lama', 'old', 'reuse', 'pakai', 'gunakan'].includes(text)) {
        pending.delete(keyOf(m));
        await runStart(this, m, 'qr', '', { useExisting: true });
        return true;
      }

      if (['2', 'baru', 'new', 'ganti', 'hapus', 'replace'].includes(text)) {
        await deleteJadibotSession(m.sender, 'replaced by requester');
        await m.reply('Session jadibot lama sudah dihapus.');
        await askMode(this, m, { replace: true });
        return true;
      }

      await m.reply('Pilihan tidak valid. Balas dengan 1 untuk session sebelumnya atau 2 untuk login nomor baru.');
      return true;
    }

    if (state.step === 'mode') {
      if (['1', 'qr', 'scan', 'qrcode'].includes(text)) {
        pending.delete(keyOf(m));
        await runStart(this, m, 'qr', '', { replace: !!state.replace });
        return true;
      }

      if (['2', 'pairing', 'pair', 'code', 'kode'].includes(text)) {
        await askPhone(this, m, state);
        return true;
      }

      await m.reply('Pilihan tidak valid. Balas dengan 1 untuk QR atau 2 untuk Pairing Code.');
      return true;
    }

    if (state.step === 'phone') {
      const phone = normalizePhone(text);
      if (phone.length < 8) {
        await m.reply('Nomor tidak valid. Gunakan format negara, contoh 6281234567890.');
        return true;
      }
      pending.delete(keyOf(m));
      await runStart(this, m, 'pairing', phone, { replace: !!state.replace });
      return true;
    }
  } catch (error) {
    pending.delete(keyOf(m));
    await m.reply(`Gagal membuat jadibot: ${error.message}`);
    return true;
  }

  return false;
};

handler.help = ['jadibot'];
handler.tags = ['jadibot'];
handler.command = /^jadibot$/i;
handler.limit = true;

handler.description = "Memulai flow interaktif jadibot dengan pilihan QR atau pairing code.";

export default handler;
