import assert from "node:assert/strict"
import test from "node:test"
import { app } from "../src/app.js"
import { authClient } from "../src/db.js"

const enabled = Boolean(process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD)

test("live client cannot call owner/manager/staff APIs and logout revokes replay", { skip: !enabled }, async () => {
  const auth = authClient()
  const login = await auth.auth.signInWithPassword({ email: process.env.LIVE_TEST_EMAIL!, password: process.env.LIVE_TEST_PASSWORD! })
  assert.equal(login.error, null)
  const session = login.data.session!
  const cookie = `home_access=${session.access_token}; home_refresh=${session.refresh_token}`
  const headers = { Cookie: cookie, Origin: "http://localhost:3000", "Content-Type": "application/json" }
  try {
    const dashboard = await app.request("http://localhost/api/client/dashboard", { headers })
    assert.equal(dashboard.status, 200)
    assert.match(dashboard.headers.get("Cache-Control") ?? "", /no-store/)
    const own = await dashboard.json()
    assert.ok(own.coupons.every((coupon: { client_id: string }) => coupon.client_id === session.user.id))

    const history = await app.request("http://localhost/api/client/receipts", { headers })
    assert.equal(history.status, 200)
    assert.match(history.headers.get("Cache-Control") ?? "", /no-store/)
    const invoices = await history.json()
    assert.ok(invoices.receipts.length <= 12)
    assert.equal(typeof invoices.hasMore, "boolean")
    for (const invoice of invoices.receipts) {
      const detail = await app.request(`http://localhost/api/client/receipts/${invoice.id}`, { headers })
      assert.equal(detail.status, 200)
      assert.match(detail.headers.get("Cache-Control") ?? "", /no-store/)
      const document = await detail.json()
      assert.equal(document.client_id, session.user.id)
      assert.equal(document.number, invoice.number)
      assert.ok(Array.isArray(document.items))
      assert.equal("issued_by" in document, false)
    }
    const missing = await app.request("http://localhost/api/client/receipts/00000000-0000-4000-8000-000000000001", { headers })
    assert.equal(missing.status, 404)
    for (const path of ["receipts?page=-1", "receipts/not-a-uuid"]) assert.equal((await app.request(`http://localhost/api/client/${path}`, { headers })).status, 400)

    if (process.env.LIVE_TEST_OTHER_EMAIL) {
      const otherAuth = authClient()
      const otherLogin = await otherAuth.auth.signInWithPassword({ email: process.env.LIVE_TEST_OTHER_EMAIL, password: process.env.LIVE_TEST_PASSWORD! })
      assert.equal(otherLogin.error, null)
      try {
        const otherSession = otherLogin.data.session!
        const otherHeaders = { Cookie: `home_access=${otherSession.access_token}; home_refresh=${otherSession.refresh_token}` }
        const otherList = await app.request("http://localhost/api/client/receipts", { headers: otherHeaders })
        assert.equal(otherList.status, 200)
        const otherInvoices = await otherList.json()
        assert.ok(otherInvoices.receipts.length, "The second demo client must have an existing receipt")
        const forbidden = await app.request(`http://localhost/api/client/receipts/${otherInvoices.receipts[0].id}`, { headers })
        assert.equal(forbidden.status, 404)
      } finally {
        await otherAuth.auth.signOut({ scope: "local" })
      }
    }

    const original = await auth.from("profiles").select("full_name,phone").eq("id", session.user.id).single()
    assert.equal(original.error, null)
    const saved = original.data!
    try {
      const update = await app.request("http://localhost/api/client/profile", { method: "PATCH", headers, body: JSON.stringify({ fullName: "Cliente de prueba", phone: "+506 8888 8888" }) })
      assert.equal(update.status, 200)
      const updated = await update.json()
      assert.equal(updated.id, session.user.id)
      assert.equal(updated.full_name, "Cliente de prueba")
      assert.equal(updated.phone, "50688888888")
      const persisted = await auth.from("profiles").select("full_name,phone").eq("id", session.user.id).single()
      assert.equal(persisted.error, null)
      assert.deepEqual(persisted.data, { full_name: "Cliente de prueba", phone: "50688888888" })
      const spoofed = await app.request("http://localhost/api/client/profile", { method: "PATCH", headers, body: JSON.stringify({ fullName: "Otro nombre", phone: null, id: "00000000-0000-4000-8000-000000000001" }) })
      assert.equal(spoofed.status, 400)
    } finally {
      const restored = await auth.from("profiles").update(saved).eq("id", session.user.id)
      assert.equal(restored.error, null)
    }

    const routes = app.routes.filter((route) => route.path.startsWith("/api/owner/") && route.method !== "ALL")
    for (const route of routes) {
      const path = route.path.replace(/:id/g, "00000000-0000-4000-8000-000000000001")
      const response = await app.request(`http://localhost${path}`, { method: route.method, headers, ...(route.method === "GET" ? {} : { body: "{}" }) })
      assert.equal(response.status, 403, `${route.method} ${route.path}`)
      assert.match(response.headers.get("Cache-Control") ?? "", /no-store/)
    }
    for (const path of ["/api/manager/dashboard", "/api/staff/dashboard"]) assert.equal((await app.request(`http://localhost${path}`, { headers })).status, 403)
    const statusChange = await app.request("http://localhost/api/appointments/00000000-0000-4000-8000-000000000001/status", { method: "PATCH", headers, body: JSON.stringify({ status: "completed" }) })
    assert.equal(statusChange.status, 403)

    const logout = await app.request("http://localhost/api/auth/signout", { method: "POST", headers })
    assert.equal(logout.status, 200)
    const replay = await app.request("http://localhost/api/client/dashboard", { headers })
    assert.equal(replay.status, 401)
    const refreshed = await auth.auth.refreshSession({ refresh_token: session.refresh_token })
    assert.ok(refreshed.error, "The signed-out refresh token must not start another session")
  } finally {
    await auth.auth.signOut({ scope: "local" })
  }
})
