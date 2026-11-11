import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { bodyLimit } from "hono/body-limit"
import { compress } from "hono/compress"
import { etag } from "hono/etag"
import { ZodError } from "zod"
import { allowedOrigins, config } from "./config.js"
import { authClient, database, unwrap } from "./db.js"
import { clearSession, readCookies, requireRole, saveSession, sessionFor } from "./auth.js"
import { invalidateCatalog, ownerCatalog, publicCatalog } from "./catalog.js"
import * as v from "./validation.js"
import { registerOwnerRoutes } from "./owner.js"
import { registerManagerRoutes } from "./manager.js"
import { registerCrmRoutes } from "./crm.js"
import { limitAuthentication, limitPublicInquiries, privateApiHeaders, securityHeaders } from "./security.js"

export const app = new Hono()

app.use("*", securityHeaders)
app.use("/api/*", privateApiHeaders)
app.use("/api/*", bodyLimit({ maxSize: 32 * 1024 }))
app.use("/api/*", async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin")
    if (!origin || !allowedOrigins.has(origin)) throw new HTTPException(403, { message: "Origen no permitido." })
  }
  await next()
})
app.use("/api/auth/*", limitAuthentication)
app.use("/api/inquiries", limitPublicInquiries)
for (const [path, role] of [["owner", "owner"], ["manager", "manager"], ["staff", "barber"], ["client", "client"]] as const) {
  app.use(`/api/${path}/*`, async (c, next) => { await requireRole(c, role); await next() })
}
app.use("/api/public", compress({ encoding: "gzip", threshold: 1024 }))
app.use("/api/public", etag({ weak: true }))

app.onError((error, c) => {
  c.header("Cache-Control", "private, no-store")
  c.header("Vary", "Cookie")
  if (error instanceof ZodError) return c.json({ error: error.issues[0]?.message ?? "Datos inválidos." }, 400)
  if (error instanceof SyntaxError) return c.json({ error: "El cuerpo de la solicitud no contiene JSON válido." }, 400)
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
  console.error(error)
  return c.json({ error: "No se pudo procesar la solicitud." }, 500)
})

app.get("/api/health", (c) => c.json({ status: "ok" }))
app.get("/api/public", async (c) => {
  const catalog = await publicCatalog()
  c.header("Cache-Control", "public, max-age=15, must-revalidate")
  c.header("Pragma", undefined)
  c.header("Vary", "Accept-Encoding")
  return c.json(catalog)
})

app.post("/api/auth/signup", async (c) => {
  const body = v.registration.parse(await c.req.json())
  const result = await authClient().auth.signUp({
    email: body.email.toLowerCase(), password: body.password,
    options: { data: { full_name: body.fullName }, emailRedirectTo: config.webOrigin },
  })
  const existingEmail = result.data.user?.identities?.length === 0
    || result.error?.code === "user_already_exists"
    || result.error?.code === "email_exists"
  if (existingEmail) {
    throw new HTTPException(409, { message: "Este correo ya está registrado. Inicia sesión o recupera tu cuenta." })
  }
  if (result.error?.code === "email_address_not_authorized") {
    throw new HTTPException(503, { message: "El registro por correo aún no está habilitado para clientes. Puedes consultar tu cita por WhatsApp." })
  }
  if (result.error) throw new HTTPException(400, { message: result.error.message })
  if (result.data.session) saveSession(c, result.data.session)
  return c.json({ needsConfirmation: !result.data.session })
})

app.post("/api/auth/signin", async (c) => {
  const body = v.credentials.parse(await c.req.json())
  const result = await authClient().auth.signInWithPassword({ email: body.email.toLowerCase(), password: body.password })
  if (result.error || !result.data.session) throw new HTTPException(401, { message: "Correo o contraseña incorrectos, o correo pendiente de confirmación." })
  saveSession(c, result.data.session)
  return c.json({ ok: true })
})

app.post("/api/auth/complete", async (c) => {
  const { accessToken, refreshToken } = v.authTokens.parse(await c.req.json())
  const result = await authClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (result.error || !result.data.session || !result.data.user) {
    throw new HTTPException(401, { message: "El enlace venció o no es válido. Solicita uno nuevo." })
  }
  saveSession(c, result.data.session)
  return c.json({ ok: true })
})

app.post("/api/auth/password/reset-request", async (c) => {
  const { email } = v.passwordResetRequest.parse(await c.req.json())
  const { error } = await authClient().auth.resetPasswordForEmail(email.toLowerCase(), { redirectTo: config.webOrigin })
  if (error?.code === "email_address_not_authorized") {
    throw new HTTPException(503, { message: "La recuperación por correo aún no está habilitada para esta dirección." })
  }
  if (error) throw new HTTPException(502, { message: "No se pudo enviar el enlace. Intenta de nuevo más tarde." })
  return c.json({ ok: true })
})

app.post("/api/auth/resend-confirmation", async (c) => {
  const { email } = v.passwordResetRequest.parse(await c.req.json())
  const { error } = await authClient().auth.resend({
    type: "signup",
    email: email.toLowerCase(),
    options: { emailRedirectTo: config.webOrigin },
  })
  if (error?.code === "over_email_send_rate_limit") {
    throw new HTTPException(429, { message: "Se alcanzó el límite de correos. Intenta de nuevo más tarde." })
  }
  if (error) throw new HTTPException(502, { message: "No se pudo reenviar el correo. Revisa la configuración SMTP e inténtalo de nuevo." })
  return c.json({ ok: true })
})

app.post("/api/auth/password", async (c) => {
  const { password } = v.newPassword.parse(await c.req.json())
  const session = await sessionFor(c)
  if (!session.refreshToken) throw new HTTPException(401, { message: "Tu sesión venció. Solicita otro enlace." })
  const auth = authClient()
  const restored = await auth.auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken })
  if (restored.error || !restored.data.session) throw new HTTPException(401, { message: "Tu sesión venció. Solicita otro enlace." })
  const updated = await auth.auth.updateUser({ password })
  if (updated.error) throw new HTTPException(400, { message: updated.error.message })
  saveSession(c, restored.data.session)
  return c.json({ ok: true })
})

app.post("/api/auth/signout", async (c) => {
  const cookies = readCookies(c)
  if (cookies.accessToken || cookies.refreshToken) {
    let session
    try { session = await sessionFor(c) } catch (error) {
      if (!(error instanceof HTTPException) || error.status !== 401) throw error
    }
    if (session) {
      const auth = authClient()
      if (!session.refreshToken) throw new HTTPException(401, { message: "Vuelve a iniciar sesión para cerrar esta sesión." })
      const restored = await auth.auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken })
      if (restored.error) throw new HTTPException(502, { message: "No se pudo cerrar tu sesión. Intenta de nuevo." })
      const signedOut = await auth.auth.signOut({ scope: "local" })
      if (signedOut.error) throw new HTTPException(502, { message: "No se pudo cerrar tu sesión. Intenta de nuevo." })
    }
  }
  clearSession(c)
  return c.json({ ok: true })
})

app.get("/api/auth/session", async (c) => {
  const cookies = readCookies(c)
  if (!cookies.accessToken && !cookies.refreshToken) return c.json({ user: null, profile: null, loyalty: null, role: "client" })
  try {
    const session = await sessionFor(c)
    const [profile, loyalty] = await Promise.all([
      session.db.from("profiles").select("*").eq("id", session.userId).single(),
      session.db.from("loyalty_accounts").select("*").eq("client_id", session.userId).single(),
    ])
    c.header("Cache-Control", "private, no-store")
    return c.json({
      user: { id: session.userId, email: session.email },
      profile: unwrap(profile), loyalty: unwrap(loyalty),
      role: session.role,
      branchId: session.branchId,
    })
  } catch (error) {
    if (error instanceof HTTPException && error.status === 401) return c.json({ user: null, profile: null, loyalty: null, role: "client" })
    throw error
  }
})

app.get("/api/client/dashboard", async (c) => {
  const session = await sessionFor(c)
  const [appointments, promotions, coupons, referrals, loyalty] = await Promise.all([
    session.db.from("appointment_requests").select("*").order("requested_at", { ascending: false }),
    session.db.from("promotions").select("*").order("created_at", { ascending: false }),
    session.db.from("coupons").select("*").order("claimed_at", { ascending: false }),
    session.db.from("referrals").select("*").or(`invited_id.eq.${session.userId},referrer_id.eq.${session.userId}`).order("joined_at", { ascending: false }),
    session.db.from("loyalty_accounts").select("*").eq("client_id", session.userId).single(),
  ])
  c.header("Cache-Control", "private, no-store")
  return c.json({ appointments: unwrap(appointments), promotions: unwrap(promotions), coupons: unwrap(coupons), referrals: unwrap(referrals), loyalty: unwrap(loyalty) })
})

app.get("/api/client/receipts", async (c) => {
  const session = await sessionFor(c)
  const page = v.receiptPage.parse(c.req.query("page"))
  const offset = (page - 1) * 12
  const receipts = unwrap<unknown[]>(await session.db.from("service_receipts")
    .select("id,number,branch_id,client_name,barber_name,branch_name,total,issued_at")
    .eq("client_id", session.userId).order("issued_at", { ascending: false }).order("id")
    .range(offset, offset + 12))
  return c.json({ receipts: receipts.slice(0, 12), hasMore: receipts.length > 12 })
})

app.get("/api/client/receipts/:id", async (c) => {
  const session = await sessionFor(c)
  const id = v.receiptId.parse(c.req.param("id"))
  const receipt = unwrap<Record<string, unknown> | null>(await session.db.from("service_receipts")
    .select("id,number,branch_id,client_id,barber_id,appointment_id,issued_at,client_name,client_email,barber_name,branch_name,items,subtotal,total,currency,note,coupon_id,coupon_code,discount_amount,discount_description,discount_type,discount_value")
    .eq("id", id).eq("client_id", session.userId).maybeSingle())
  if (!receipt) throw new HTTPException(404, { message: "Comprobante no encontrado." })
  return c.json(receipt)
})

app.post("/api/client/coupons", async (c) => {
  const session = await sessionFor(c)
  const body = v.claimCoupon.parse(await c.req.json())
  unwrap(await session.db.rpc("claim_legacy_coupon", { p_promotion_id: body.promotionId }), 400)
  return c.json({ ok: true }, 201)
})

app.post("/api/client/referrals", async (c) => {
  const session = await sessionFor(c)
  const body = v.referral.parse(await c.req.json())
  unwrap(await session.db.rpc("register_referral", { p_code: body.code }), 400)
  return c.json({ ok: true }, 201)
})

app.patch("/api/client/profile", async (c) => {
  const session = await sessionFor(c)
  const body = v.profile.parse(await c.req.json())
  const updated = unwrap<{ id: string; email: string | null; full_name: string; phone: string | null } | null>(await session.db.from("profiles").update({ full_name: body.fullName, phone: body.phone }).eq("id", session.userId).select("id,email,full_name,phone").maybeSingle(), 400)
  if (!updated) throw new HTTPException(404, { message: "No encontramos tu perfil. Vuelve a iniciar sesión." })
  return c.json(updated)
})

app.get("/api/staff/dashboard", async (c) => {
  const session = await requireRole(c, "barber")
  const appointments = await session.db.from("appointment_requests").select("*").order("requested_at", { ascending: false })
  return c.json({ appointments: unwrap(appointments) })
})

app.get("/api/owner/dashboard", async (c) => {
  const session = await requireRole(c, "owner")
  const [appointments, promotions, coupons, profiles, loyaltyAccounts, managers, catalog, referrals] = await Promise.all([
    session.db.from("appointment_requests").select("*").order("requested_at", { ascending: false }),
    session.db.from("promotions").select("*").order("created_at", { ascending: false }),
    session.db.from("coupons").select("*").order("claimed_at", { ascending: false }),
    session.db.from("profiles").select("*").order("created_at", { ascending: false }),
    session.db.from("loyalty_accounts").select("*"),
    session.db.from("staff_roles").select("user_id,branch_id").eq("role", "manager"),
    ownerCatalog(session.db),
    session.db.from("referrals").select("*").order("joined_at", { ascending: false }),
  ])
  return c.json({
    appointments: unwrap(appointments), promotions: unwrap(promotions), coupons: unwrap(coupons),
    profiles: unwrap(profiles), loyaltyAccounts: unwrap(loyaltyAccounts), managers: unwrap(managers), catalog, referrals: unwrap(referrals),
  })
})

app.post("/api/appointments", async (c) => {
  const session = await sessionFor(c)
  const body = v.appointment.parse(await c.req.json())
  await validateBooking(session.db, body)
  unwrap(await session.db.from("appointment_requests").insert({
    client_id: session.userId, branch_id: body.branchId, barber_id: body.barberId,
    service_id: body.serviceId, requested_at: body.requestedAt,
    customer_name: body.customerName, customer_whatsapp: body.customerWhatsapp, notes: body.notes,
  }), 400)
  return c.json({ ok: true }, 201)
})

app.patch("/api/appointments/:id/status", async (c) => {
  const session = await sessionFor(c)
  if (session.role !== "owner" && session.role !== "barber") throw new HTTPException(403, { message: "No tienes permiso para cambiar esta cita." })
  const id = v.claimCoupon.shape.promotionId.parse(c.req.param("id"))
  const body = v.appointmentStatus.parse(await c.req.json())
  const result = await session.db.from("appointment_requests").update({ status: body.status }).eq("id", id).select("id,status").maybeSingle()
  const changed = unwrap<{ id: string; status: string } | null>(result, 400)
  if (!changed) throw new HTTPException(403, { message: "No tienes permiso para cambiar esta cita." })
  invalidateCatalog()
  return c.json(changed)
})

async function validateBooking(db: ReturnType<typeof database>, body: ReturnType<typeof v.appointment.parse>) {
  const starts = new Date(body.requestedAt)
  if (!Number.isFinite(starts.getTime()) || starts.getTime() <= Date.now() + 30 * 60_000) throw new HTTPException(400, { message: "El horario debe ser futuro." })
  const [service, branch, barber, assignment] = await Promise.all([
    db.from("services").select("duration_minutes").eq("id", body.serviceId).eq("active", true).maybeSingle(),
    db.from("branches").select("id").eq("id", body.branchId).eq("active", true).maybeSingle(),
    db.from("barbers").select("id").eq("id", body.barberId).eq("active", true).maybeSingle(),
    db.from("barber_branches").select("barber_id").eq("barber_id", body.barberId).eq("branch_id", body.branchId).maybeSingle(),
  ])
  if (service.error || branch.error || barber.error || assignment.error) throw new HTTPException(502, { message: "No se pudo comprobar la disponibilidad." })
  if (!service.data || !branch.data || !barber.data || !assignment.data) throw new HTTPException(400, { message: "La sede, el servicio o el barbero ya no están disponibles." })
  const ends = new Date(starts.getTime() + service.data.duration_minutes * 60_000)
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Costa_Rica", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(starts)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"))
  const minute = Number(get("hour")) * 60 + Number(get("minute"))
  if (weekday < 0 || minute % 30 !== 0) throw new HTTPException(400, { message: "Selecciona un horario válido." })
  const [branchHour, barberHour, conflicts] = await Promise.all([
    db.from("branch_hours").select("opens_at,closes_at,closed").eq("branch_id", body.branchId).eq("weekday", weekday).maybeSingle(),
    db.from("barber_hours").select("opens_at,closes_at").eq("branch_id", body.branchId).eq("barber_id", body.barberId).eq("weekday", weekday).maybeSingle(),
    db.from("barber_blocks").select("id").eq("branch_id", body.branchId).eq("barber_id", body.barberId).lt("starts_at", ends.toISOString()).gt("ends_at", starts.toISOString()).limit(1),
  ])
  if (branchHour.error || barberHour.error || conflicts.error) throw new HTTPException(502, { message: "No se pudo comprobar la disponibilidad." })
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  if (!branchHour.data || branchHour.data.closed || !branchHour.data.opens_at || !branchHour.data.closes_at || !barberHour.data ||
    minute < Math.max(toMinutes(branchHour.data.opens_at), toMinutes(barberHour.data.opens_at)) ||
    minute + service.data.duration_minutes > Math.min(toMinutes(branchHour.data.closes_at), toMinutes(barberHour.data.closes_at)) ||
    (conflicts.data?.length ?? 0) > 0) throw new HTTPException(409, { message: "Este horario ya no está disponible." })
}

registerOwnerRoutes(app)
registerManagerRoutes(app)
registerCrmRoutes(app)
// Unknown API paths must never fall through to the SPA HTML handler.
app.all("/api/*", (c) => c.json({ error: "Ruta API no encontrada." }, 404))
