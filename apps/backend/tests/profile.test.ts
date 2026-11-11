import assert from "node:assert/strict"
import test from "node:test"
import { profile } from "../src/validation.js"
import { app } from "../src/app.js"

test("profile trims names and normalizes formatted WhatsApp numbers", () => {
  assert.deepEqual(profile.parse({ fullName: "  Ana Perez  ", phone: "+506 (8888)-8888" }), { fullName: "Ana Perez", phone: "50688888888" })
  for (const phone of [null, "", "   "]) assert.equal(profile.parse({ fullName: "Ana Perez", phone }).phone, null)
})

test("profile rejects invalid names, phone numbers and protected fields", () => {
  for (const fullName of [" ", "A", "a".repeat(101)]) assert.equal(profile.safeParse({ fullName, phone: null }).success, false)
  for (const phone of ["123", "1234567890123456", "8888abcd", "1".repeat(41)]) assert.equal(profile.safeParse({ fullName: "Ana Perez", phone }).success, false)
  for (const key of ["id", "userId", "role", "email"]) assert.equal(profile.safeParse({ fullName: "Ana Perez", phone: null, [key]: "other" }).success, false)
})

test("profile update requires an authenticated session", async () => {
  const response = await app.request("http://localhost/api/client/profile", {
    method: "PATCH",
    headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "Ana Perez", phone: null }),
  })
  assert.equal(response.status, 401)
  assert.match(response.headers.get("Cache-Control") ?? "", /no-store/)
})
