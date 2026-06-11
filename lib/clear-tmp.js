import fs from 'fs/promises';
import path from 'path';
import logger from './logger.js';

export async function clearTmp(rootDir) {
  const tmpDir = path.join(rootDir, 'tmp');
  let removed = 0;

  try {
    const entries = await fs.readdir(tmpDir, { withFileTypes: true });
    for (const entry of entries) {
      await fs.rm(path.join(tmpDir, entry.name), { recursive: true, force: true });
      removed += 1;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await fs.mkdir(tmpDir, { recursive: true });
  logger.warn('cleanup', `tmp files removed: ${removed}`);
  return removed;
}

export default clearTmp;
