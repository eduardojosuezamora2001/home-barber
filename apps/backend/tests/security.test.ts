import assert from "node:assert/strict"
import test from "node:test"
import { app } from "../src/app.js"

const origin = "http://localhost:3000"

test("every owner route rejects anonymous requests before reading or writing data", async () => {
  const routes = app.routes.filter((route) => route.path.startsWith("/api/owner/") && route.method !== "ALL")
  assert.ok(routes.length >= 15)
  for (const route of routes) {
    const path = route.path.replace(/:id/g, "00000000-0000-4000-8000-000000000001")
    const response = await app.request(`http://localhost${path}`, { method: route.method, headers: { Origin: origin, "Content-Type": "application/json" }, ...(route.method === "GET" ? {} : { body: "{}" }) })
    assert.equal(response.status, 401, `${route.method} ${route.path}`)
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/)
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff")
  }
})

test("invalid session cookies cannot enter the owner namespace", async () => {
  const response = await app.request("http://localhost/api/owner/dashboard", { headers: { Cookie: "home_access=not-a-token" } })
  assert.equal(response.status, 401)
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/)
})

test("cross-site requests and writes without Origin are rejected", async () => {
  const read = await app.request("http://localhost/api/owner/dashboard", { headers: { "Sec-Fetch-Site": "cross-site" } })
  assert.equal(read.status, 403)
  const write = await app.request("http://localhost/api/owner/branches", { method: "POST", body: "{}" })
  assert.equal(write.status, 403)
})

test("unauthenticated session responses cannot be cached", async () => {
  const response = await app.request("http://localhost/api/auth/session")
  assert.equal(response.status, 200)
  assert.match(response.headers.get("Cache-Control") ?? "", /private, no-store/)
  assert.equal((await response.json()).user, null)
})

test("unknown API routes return JSON 404, never the SPA document", async () => {
  const response = await app.request("http://localhost/api/not-a-route")
  assert.equal(response.status, 404)
  assert.match(response.headers.get("Content-Type") ?? "", /application\/json/)
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/)
})

test("malformed JSON is rejected without disclosing a server error", async () => {
  const response = await app.request("http://localhost/api/auth/signin", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{" })
  assert.equal(response.status, 400)
})

test("authentication endpoints limit repeated attempts", async () => {
  let response: Response | undefined
  for (let i = 0; i < 11; i++) response = await app.request("http://localhost/api/auth/signin", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "rate-limit-fixture", password: "too-short" }),
  })
  assert.equal(response?.status, 429)
  assert.ok(Number(response?.headers.get("Retry-After")) > 0)
})
