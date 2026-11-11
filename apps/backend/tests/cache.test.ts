import assert from "node:assert/strict"
import test from "node:test"
import { createPublicCache } from "../src/cache.js"
import { WindowRateLimiter } from "../src/security.js"
import { apiRequest } from "../../web/src/lib/api.js"

test("public cache shares concurrent loads and expires", async (t) => {
  let now = 100
  t.mock.method(Date, "now", () => now)
  const cache = createPublicCache<number>(1000)
  let calls = 0
  const load = async () => ++calls
  assert.deepEqual(await Promise.all([cache.get(load), cache.get(load)]), [1, 1])
  assert.equal(await cache.get(load), 1)
  now += 1001
  assert.equal(await cache.get(load), 2)
})

test("invalidating a pending catalog cannot repopulate stale data", async () => {
  const cache = createPublicCache<string>(1000)
  let release!: (value: string) => void
  const stale = cache.get(() => new Promise<string>((resolve) => { release = resolve }))
  cache.invalidate()
  assert.equal(await cache.get(async () => "updated"), "updated")
  release("old")
  await stale
  assert.equal(await cache.get(async () => "unexpected"), "updated")
})

test("failed catalog loads are not retained", async () => {
  const cache = createPublicCache<string>(1000)
  await assert.rejects(cache.get(async () => { throw new Error("offline") }))
  assert.equal(await cache.get(async () => "recovered"), "recovered")
})

test("authentication limiter isolates clients and resets expired windows", () => {
  const limiter = new WindowRateLimiter(2)
  assert.equal(limiter.take("a", 2, 1000, 0).allowed, true)
  assert.equal(limiter.take("a", 2, 1000, 1).allowed, true)
  assert.equal(limiter.take("a", 2, 1000, 2).allowed, false)
  assert.equal(limiter.take("b", 2, 1000, 2).allowed, true)
  assert.equal(limiter.take("a", 2, 1000, 1001).allowed, true)
})

test("browser caching applies only to the anonymous public catalog", async (t) => {
  const requests: RequestInit[] = []
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    requests.push(options)
    return Response.json({ ok: true })
  })
  await apiRequest("GET", "/public")
  await apiRequest("GET", "/public", undefined, { cache: "reload" })
  await apiRequest("GET", "/owner/dashboard", undefined, { cache: "force-cache" })
  await apiRequest("GET", "/auth/session")
  assert.equal(requests[0]?.cache, "default")
  assert.equal(requests[0]?.credentials, "omit")
  assert.equal(requests[1]?.cache, "reload")
  for (const request of requests.slice(2)) {
    assert.equal(request.cache, "no-store")
    assert.equal(request.credentials, "same-origin")
  }
})
