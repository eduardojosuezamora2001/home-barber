import assert from "node:assert/strict"
import test from "node:test"
import { app } from "../src/app.js"
import { receiptId, receiptPage } from "../src/validation.js"

test("client receipt history and details require authentication", async () => {
  for (const path of ["/api/client/receipts", "/api/client/receipts/00000000-0000-4000-8000-000000000001"]) {
    const response = await app.request(`http://localhost${path}`)
    assert.equal(response.status, 401)
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/)
  }
})

test("client receipt pagination and identifiers reject malformed input", () => {
  assert.equal(receiptPage.parse(undefined), 1)
  assert.equal(receiptPage.parse("2"), 2)
  for (const page of ["0", "-1", "1.5", "100001", "NaN", "Infinity", ""]) assert.equal(receiptPage.safeParse(page).success, false)
  for (const id of ["invalid", "../receipts", "00000000-0000-4000-8000-000000000001?id=other"]) assert.equal(receiptId.safeParse(id).success, false)
})
