import fs from 'fs/promises';
import path from 'path';
import logger from './logger.js';

const formatSize = (bytes = 0) => {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  return `${(num / 1024 ** i).toFixed(i? 1 : 0)} ${units[i]}`;
};

const getFolderSize = async (dir) => {
  let size = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) size += await getFolderSize(p);
      else size += (await fs.stat(p)).size;
    }
  } catch {}
  return size;
};

/**
 * Hapus semua file di tmp/
 * @param {string} rootDir 
 * @param {{maxAgeMs: number, dryRun: boolean}} options 
 * maxAgeMs: hapus file >24 jam. 0 = hapus semua
 */
export async function clearTmp(rootDir, options = {}) {
  const tmpDir = path.join(rootDir, 'tmp');
  const { maxAgeMs = 24 * 60 * 60 * 1000, dryRun = false } = options; // [FIX] Default 24 jam
  let removed = 0;
  let totalBytes = 0;
  const now = Date.now();

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    const entries = await fs.readdir(tmpDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(tmpDir, entry.name);
      const stat = await fs.stat(entryPath).catch(() => null);
      if (!stat) continue;

      const age = now - stat.mtimeMs;
      const shouldRemove = maxAgeMs === 0 || age > maxAgeMs; // [FIX] Cuma hapus yg lama

      if (shouldRemove) {
        const size = stat.isDirectory()? await getFolderSize(entryPath) : stat.size;
        if (!dryRun) await fs.rm(entryPath, { recursive: true, force: true });
        removed += 1;
        totalBytes += size;
        logger.warn('cleanup', `${dryRun? '[DRY]' : 'removed'}: tmp/${entry.name} [${formatSize(size)}] ${Math.floor(age/3600000)}h ago`);
      }
    }
  } catch (error) {
    if (error.code!== 'ENOENT') {
      logger.error('cleanup', 'clear tmp failed', error.message);
      throw error;
    }
  }

  logger.warn('cleanup', `tmp files ${dryRun? 'to remove' : 'removed'}: ${removed} [${formatSize(totalBytes)}]`);
  return { removed, bytes: totalBytes };
}

export default clearTmp;