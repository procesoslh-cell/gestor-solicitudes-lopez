class TtlCache {
  constructor({ maxItems = 250, defaultTtlMs = 60000 } = {}) {
    this.maxItems = maxItems;
    this.defaultTtlMs = defaultTtlMs;
    this.store = new Map();
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0 };
  }

  _now() {
    return Date.now();
  }

  _evictIfNeeded() {
    while (this.store.size > this.maxItems) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) {
      this.stats.misses += 1;
      return null;
    }
    if (item.expiresAt <= this._now()) {
      this.store.delete(key);
      this.stats.misses += 1;
      return null;
    }
    this.stats.hits += 1;
    return item.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.store.set(key, {
      value,
      createdAt: this._now(),
      expiresAt: this._now() + Math.max(1000, Number(ttlMs || this.defaultTtlMs)),
    });
    this.stats.sets += 1;
    this._evictIfNeeded();
    return value;
  }

  delete(key) {
    const deleted = this.store.delete(key);
    if (deleted) this.stats.deletes += 1;
    return deleted;
  }

  clear() {
    const count = this.store.size;
    this.store.clear();
    this.stats.deletes += count;
    return count;
  }

  snapshot() {
    return {
      size: this.store.size,
      maxItems: this.maxItems,
      stats: { ...this.stats },
    };
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

function makeCacheKey(parts) {
  return stableStringify(parts);
}

const queryCache = new TtlCache({
  maxItems: Number(process.env.QUERY_CACHE_MAX_ITEMS || 300),
  defaultTtlMs: Number(process.env.QUERY_CACHE_TTL_MS || 60000),
});

module.exports = { TtlCache, queryCache, makeCacheKey };
