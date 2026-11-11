import assert from "node:assert/strict"

const origin = new URL(process.argv[2] || "http://127.0.0.1:8798").origin
const request = (path, options = {}) => fetch(`${origin}${path}`, {
  ...options, signal: AbortSignal.timeout(10_000),
})

let html = ""
for (const path of ["/", "/cliente?tab=citas", "/admin"]) {
  const response = await request(path)
  assert.equal(response.status, 200, path)
  assert.match(response.headers.get("Content-Type") || "", /text\/html/, path)
  const document = await response.text()
  assert.match(document, /id="root"/, path)
  if (path === "/") html = document
}

const assetPath = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1]
assert.ok(assetPath, "La SPA debe cargar su JavaScript compilado")
const asset = await request(assetPath)
assert.equal(asset.status, 200)
assert.match(asset.headers.get("Cache-Control") || "", /immutable/)

const health = await request("/api/health")
assert.equal(health.status, 200)
assert.equal((await health.json()).status, "ok")
const missingApi = await request("/api/does-not-exist")
assert.equal(missingApi.status, 404)
assert.match(missingApi.headers.get("Content-Type") || "", /application\/json/)

// Invalid input is rejected before any request to Supabase or email delivery.
const invalidInput = await request("/api/auth/signin", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}",
})
assert.equal(invalidInput.status, 400)
const invalidOrigin = await request("/api/auth/signin", {
  method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}",
})
assert.equal(invalidOrigin.status, 403)

// No cookies are supplied: this only verifies the two cookie-deletion headers.
const signout = await request("/api/auth/signout", { method: "POST", headers: { Origin: origin } })
assert.equal(signout.status, 200)
const cookies = signout.headers.getSetCookie()
assert.equal(cookies.length, 2, "El proxy debe conservar ambos Set-Cookie")
assert.ok(cookies.some((cookie) => cookie.startsWith("home_access=")))
assert.ok(cookies.some((cookie) => cookie.startsWith("home_refresh=")))

if (process.argv.includes("--catalog")) {
  const catalogs = await Promise.all(Array.from({ length: 3 }, async () => {
    const response = await request("/api/public")
    assert.equal(response.status, 200)
    const catalog = await response.json()
    assert.ok(Array.isArray(catalog.branches))
    assert.ok(Array.isArray(catalog.services))
    return catalog
  }))
  console.log(`Catálogo Supabase OK: ${catalogs[0].branches.length} sucursales, ${catalogs[0].services.length} servicios; 3 lecturas concurrentes.`)
}

console.log("Cloudflare HTTP OK: SPA, assets, API binding, validación, CSRF y dos cookies de sesión.")
