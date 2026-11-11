import assert from "node:assert/strict"
import test from "node:test"
import { app } from "../src/app.js"

const origin = "http://localhost:3000"

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

test("rejects writes from an unknown origin", async () => {
  const response = await post("/api/auth/complete", {}, { Origin: "https://other.example" })
  assert.equal(response.status, 403)
})

test("rejects malformed email-link tokens before contacting Supabase", async () => {
  const response = await post("/api/auth/complete", { accessToken: "short", refreshToken: "short" }, { Origin: origin })
  assert.equal(response.status, 400)
})

test("rejects an invalid reset-request email", async () => {
  const response = await post("/api/auth/password/reset-request", { email: "invalid" }, { Origin: origin })
  assert.equal(response.status, 400)
})

test("rejects an invalid confirmation email", async () => {
  const response = await post("/api/auth/resend-confirmation", { email: "invalid" }, { Origin: origin })
  assert.equal(response.status, 400)
})

test("requires a session to change the password", async () => {
  const response = await post("/api/auth/password", { password: "new-passphrase-123" }, { Origin: origin })
  assert.equal(response.status, 401)
})

test("requires a session for the manager dashboard", async () => {
  const response = await app.request("http://localhost/api/manager/dashboard")
  assert.equal(response.status, 401)
})

test("requires a session to issue an internal receipt", async () => {
  const response = await post("/api/manager/receipts", {}, { Origin: origin })
  assert.equal(response.status, 401)
})

test("requires a session to assign a branch manager", async () => {
  const response = await post("/api/owner/managers", {}, { Origin: origin })
  assert.equal(response.status, 401)
})

test("requires an owner session to issue a receipt for any branch", async () => {
  const response = await post("/api/owner/receipts", {}, { Origin: origin })
  assert.equal(response.status, 401)
})
