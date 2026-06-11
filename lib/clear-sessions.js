import fs from 'fs/promises';
import path from 'path';
import logger from './logger.js';

export async function clearSessions(rootDir, options = {}) {
  const sessionDir = path.join(rootDir, 'session');
  const target = options.target ? path.join(sessionDir, options.target) : sessionDir;
  let removed = 0;

  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      await fs.rm(path.join(target, entry.name), { recursive: true, force: true });
      removed += 1;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  logger.warn('cleanup', `session files removed: ${removed}`);
  return removed;
}

export default clearSessions;
