/** Memory cache for public data only. Invalidation also isolates in-flight loads. */
export function createPublicCache<T>(ttlMs: number, { deduplicate = true } = {}) {
  let generation = 0
  let cached: { value: T; until: number } | undefined
  let pending: Promise<T> | undefined

  return {
    get(loader: () => Promise<T>): Promise<T> {
      if (cached && cached.until > Date.now()) return Promise.resolve(cached.value)
      if (deduplicate && pending) return pending
      const startedAt = generation
      const request = loader().then((value) => {
        if (generation === startedAt) cached = { value, until: Date.now() + ttlMs }
        return value
      }).finally(() => { if (pending === request) pending = undefined })
      if (deduplicate) pending = request
      return request
    },
    invalidate() {
      generation += 1
      cached = undefined
      pending = undefined
    },
  }
}
