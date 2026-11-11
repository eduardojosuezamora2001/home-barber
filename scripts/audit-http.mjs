import assert from "node:assert/strict"
import http from "node:http"
import https from "node:https"
import { brotliDecompressSync, gunzipSync } from "node:zlib"

const base = new URL(process.argv[2] ?? "http://127.0.0.1:8789")
const transport = base.protocol === "https:" ? https : http

async function request(path, headers = {}) {
  const started = performance.now()
  return new Promise((resolve, reject) => {
    const req = transport.get(new URL(path, base), { headers: { "Accept-Encoding": "gzip", ...headers } }, (res) => {
      const chunks = []
      res.on("data", (chunk) => chunks.push(chunk))
      res.on("end", () => {
        const body = Buffer.concat(chunks)
        const decoded = res.headers["content-encoding"] === "gzip" ? gunzipSync(body) : res.headers["content-encoding"] === "br" ? brotliDecompressSync(body) : body
        resolve({ path, status: res.statusCode, headers: res.headers, bytes: body.length, decodedBytes: decoded.length, text: decoded.toString(), ms: Math.round(performance.now() - started) })
      })
      res.on("error", reject)
    })
    req.on("error", reject)
    req.setTimeout(20_000, () => req.destroy(new Error("HTTP audit timed out")))
  })
}

const document = await request("/")
assert.equal(document.status, 200)
assert.equal(document.headers["cache-control"], "no-cache")
assert.match(document.headers["content-security-policy"] ?? "", /script-src 'self'/)
assert.equal(document.headers["x-frame-options"], "DENY")
assert.equal(document.headers["x-content-type-options"], "nosniff")
assert.ok(!document.text.includes("api.fontshare.com"))
const asset = document.text.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1]
assert.ok(asset)
const javascript = await request(asset)
assert.match(javascript.headers["cache-control"] ?? "", /31536000, immutable/)
assert.equal(javascript.headers["content-encoding"], "gzip")
assert.match(javascript.headers.vary ?? "", /Accept-Encoding/i)
const javascriptBrotli = await request(asset, { "Accept-Encoding": "br" })
assert.equal(javascriptBrotli.headers["content-encoding"], "br")
const font = await request("/fonts/cabinet-grotesk-variable.woff2")
assert.equal(font.status, 200)
assert.match(font.headers["cache-control"] ?? "", /max-age=86400/)

const cold = await request("/api/public")
const warm = await request("/api/public")
assert.equal(warm.status, 200)
assert.equal(warm.headers["content-encoding"], "gzip")
assert.match(warm.headers["cache-control"] ?? "", /^public, max-age=15/)
assert.ok(!warm.headers["set-cookie"])
const catalog = JSON.parse(warm.text)
assert.ok(catalog.barbers.every((barber) => barber.user_id === null))
assert.ok(catalog.branches.every((branch) => branch.active))
assert.ok(catalog.services.every((service) => service.active))
const conditional = await request("/api/public", { "If-None-Match": warm.headers.etag })
assert.equal(conditional.status, 304)
assert.equal(conditional.bytes, 0)
const denied = await request("/api/owner/dashboard")
assert.equal(denied.status, 401)
assert.match(denied.headers["cache-control"] ?? "", /private, no-store/)
const unknown = await request("/api/not-a-route")
assert.equal(unknown.status, 404)
assert.match(unknown.headers["content-type"] ?? "", /application\/json/)

const summarize = (response) => ({ path: response.path, status: response.status, ms: response.ms, bytes: response.bytes, decodedBytes: response.decodedBytes, cache: response.headers["cache-control"], encoding: response.headers["content-encoding"] ?? "none" })
console.log(JSON.stringify({ verified: true, document: summarize(document), javascript: summarize(javascript), javascriptBrotli: summarize(javascriptBrotli), font: summarize(font), publicCold: summarize(cold), publicWarm: summarize(warm), conditional: summarize(conditional), adminAnonymous: summarize(denied), unknownApi: summarize(unknown) }, null, 2))
