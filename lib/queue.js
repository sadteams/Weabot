import logger from './logger.js';

export class AsyncQueue {
  constructor(name = 'queue', options = {}) {
    this.name = name;
    this.concurrency = Math.max(1, Number(options.concurrency || 1));
    this.interval = Math.max(0, Number(options.interval || 0));
    this.pending = [];
    this.running = 0;
    this.total = 0;
    this.completed = 0;
    this.failed = 0;
  }

  get size() {
    return this.pending.length;
  }

  get idle() {
    return this.running === 0 && this.pending.length === 0;
  }

  stats() {
    return {
      name: this.name,
      running: this.running,
      pending: this.pending.length,
      total: this.total,
      completed: this.completed,
      failed: this.failed,
    };
  }

  add(task, metadata = {}) {
    if (typeof task !== 'function') throw new TypeError('Queue task must be a function');
    this.total++;
    return new Promise((resolve, reject) => {
      this.pending.push({ task, metadata, resolve, reject, createdAt: Date.now() });
      this.next();
    });
  }

  next() {
    while (this.running < this.concurrency && this.pending.length) {
      const item = this.pending.shift();
      this.run(item);
    }
  }

  async run(item) {
    this.running++;
    const label = item.metadata?.id || item.metadata?.name || this.name;
    try {
      const result = await item.task();
      this.completed++;
      item.resolve(result);
    } catch (error) {
      this.failed++;
      logger.error(this.name, `task failed ${label}`, error.stack || error.message);
      item.reject(error);
    } finally {
      this.running--;
      if (this.interval) setTimeout(() => this.next(), this.interval);
      else this.next();
    }
  }
}

const queues = new Map();

export function getQueue(name = 'default', options = {}) {
  if (!queues.has(name)) queues.set(name, new AsyncQueue(name, options));
  return queues.get(name);
}

export function getQueueStats() {
  return Object.fromEntries([...queues.entries()].map(([name, queue]) => [name, queue.stats()]));
}

export default AsyncQueue;
