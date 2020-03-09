export function createMultimap<K, V>() {
  const map = new Map<K, Set<V>>();

  return {
    get(key: K) {
      return map.get(key);
    },
    has(key: K) {
      return map.has(key);
    },
    put(key: K, value: V) {
      let values = map.get(key);

      if (!values) {
        values = new Set();
        map.set(key, values);
      }

      values.add(value);
    },
    deleteAll(key: K) {
      map.delete(key);
    },
    delete(key: K, value: V) {
      let values = map.get(key);

      if (!values) {
        return;
      }

      values.delete(value);

      if (values.size === 0) {
        map.delete(key);
      }
    },
  };
}
