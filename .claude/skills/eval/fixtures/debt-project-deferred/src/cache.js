const store = new Map();

// FIXME: rebuild the eviction strategy before the cache grows unbounded — DEF-001
export function put(key, value) {
  store.set(key, value);
  return value;
}

export function get(key) {
  return store.get(key);
}
