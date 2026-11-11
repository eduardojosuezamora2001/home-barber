import type { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { requireRole } from "./auth.js"
import { invalidateCatalog } from "./catalog.js"
import { unwrap } from "./db.js"
import * as v from "./validation.js"

const uuid = z.uuid()
const slugify = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

function ensureHours(hours: { closed: boolean; opensAt: string | null; closesAt: string | null }[]) {
  for (const hour of hours) if (!hour.closed && (!hour.opensAt || !hour.closesAt || hour.opensAt >= hour.closesAt)) {
    throw new HTTPException(400, { message: "Cada horario abierto necesita apertura y cierre válidos." })
  }
}

export function registerOwnerRoutes(app: Hono) {
  app.get("/api/owner/managers", async (c) => {
    const session = await requireRole(c, "owner")
    const managers = unwrap<{ user_id: string; branch_id: string }[]>(await session.db.from("staff_roles").select("user_id,branch_id").eq("role", "manager"))
    return c.json({ managers })
  })

  app.post("/api/owner/managers", async (c) => {
    const session = await requireRole(c, "owner")
    const body = v.managerAssignment.parse(await c.req.json())
    const [profile, branch, current] = await Promise.all([
      session.db.from("profiles").select("id").eq("id", body.userId).maybeSingle(),
      session.db.from("branches").select("id").eq("id", body.branchId).maybeSingle(),
      session.db.from("staff_roles").select("role").eq("user_id", body.userId).maybeSingle(),
    ])
    if (!unwrap<{ id: string } | null>(profile) || !unwrap<{ id: string } | null>(branch)) throw new HTTPException(404, { message: "La cuenta o sucursal no existe." })
    const role = unwrap<{ role: string } | null>(current)?.role
    if (role && role !== "manager") throw new HTTPException(409, { message: "Esta cuenta ya tiene otro rol del equipo." })
    if (role === "manager") {
      unwrap(await session.db.from("staff_roles").update({ branch_id: body.branchId }).eq("user_id", body.userId).eq("role", "manager"), 400)
    } else {
      unwrap(await session.db.from("staff_roles").insert({ user_id: body.userId, role: "manager", branch_id: body.branchId }), 400)
    }
    return c.json({ ok: true }, role ? 200 : 201)
  })

  app.delete("/api/owner/managers/:id", async (c) => {
    const session = await requireRole(c, "owner")
    const id = uuid.parse(c.req.param("id"))
    const deleted = unwrap<{ user_id: string } | null>(await session.db.from("staff_roles").delete().eq("user_id", id).eq("role", "manager").select("user_id").maybeSingle(), 400)
    if (!deleted) throw new HTTPException(404, { message: "Encargado no encontrado." })
    return c.json({ ok: true })
  })

  app.get("/api/owner/receipts", async (c) => {
    const session = await requireRole(c, "owner")
    const offset = z.coerce.number().int().min(0).max(1000000).default(0).parse(c.req.query("offset"))
    const receipts = unwrap<unknown[]>(await session.db.from("service_receipts").select("id,number,branch_id,appointment_id,client_name,barber_name,total,issued_at").order("issued_at", { ascending: false }).order("id").range(offset, offset + 199))
    return c.json({ receipts })
  })

  app.get("/api/owner/receipt-clients", async (c) => {
    const session = await requireRole(c, "owner")
    const email = z.email().max(254).parse(c.req.query("email"))
    const clients = unwrap<{ id: string; full_name: string; email: string }[]>(await session.db.rpc("lookup_receipt_client", { p_email: email.trim().toLowerCase() }), 400)
    c.header("Cache-Control", "private, no-store")
    return c.json({ client: clients[0] ?? null })
  })

  app.post("/api/owner/receipts", async (c) => {
    const session = await requireRole(c, "owner")
    const body = v.ownerServiceReceipt.parse(await c.req.json())
    if (!body.clientId && !body.crmContactId) throw new HTTPException(400, { message: "Selecciona un cliente del CRM." })
    if (!body.clientId && body.couponCode) throw new HTTPException(400, { message: "Los cupones requieren una cuenta registrada." })
    let couponId: string | null = null
    if (body.couponCode) {
      const coupon = unwrap<{ id: string } | null>(await session.db.from("coupons").select("id").eq("code", body.couponCode).eq("client_id", body.clientId).maybeSingle(), 400)
      if (!coupon) throw new HTTPException(400, { message: "El código no corresponde a un cupón de este cliente." })
      couponId = coupon.id
    }
    const receipt = unwrap<{ id: string; number: number }>(await session.db.from("service_receipts").insert({
      branch_id: body.branchId, client_id: body.clientId, contact_id: body.crmContactId, barber_id: body.barberId,
      issued_by: session.userId, appointment_id: body.appointmentId, items: body.items, note: body.note,
      coupon_id: couponId,
    }).select("id,number").single(), 400)
    invalidateCatalog()
    return c.json(receipt, 201)
  })

  app.get("/api/owner/receipt-coupons", async (c) => {
    const session = await requireRole(c, "owner")
    const query = v.receiptCouponQuery.parse(c.req.query())
    const now = new Date().toISOString()
    let request = session.db.from("coupons").select("id,code,benefit_text,expires_at,discount_type,discount_value,promotions!inner(title,branch_id,active,starts_at,ends_at)")
      .eq("client_id", query.clientId).eq("status", "available").gt("expires_at", now)
      .eq("promotions.active", true).lte("promotions.starts_at", now).gte("promotions.ends_at", now)
      .order("expires_at")
    if (query.code) request = request.eq("code", query.code)
    const rows = unwrap<{ id: string; code: string; benefit_text: string; expires_at: string; discount_type: string; discount_value: number; promotions: { title: string; branch_id: string | null } }[]>(await request)
    const coupons = rows.filter((row) => !row.promotions.branch_id || row.promotions.branch_id === query.branchId)
      .map(({ promotions, ...coupon }) => ({ ...coupon, title: promotions.title }))
    if (query.code && !coupons.length) throw new HTTPException(400, { message: "El cupón no pertenece a este cliente, ya fue canjeado, venció o no aplica en esta sucursal." })
    return c.json({ coupons })
  })

  app.get("/api/owner/receipts/:id", async (c) => {
    const session = await requireRole(c, "owner")
    const id = uuid.parse(c.req.param("id"))
    const receipt = unwrap<Record<string, unknown> | null>(await session.db.from("service_receipts").select("*").eq("id", id).maybeSingle())
    if (!receipt) throw new HTTPException(404, { message: "Comprobante no encontrado." })
    return c.json(receipt)
  })

  app.post("/api/owner/promotions", async (c) => {
    const session = await requireRole(c, "owner")
    const body = v.promotion.parse(await c.req.json())
    const result = await session.db.from("promotions").insert({
      title: body.title, description: body.description, benefit_text: body.benefitText,
      branch_id: body.branchId, kind: body.kind,
      visits_every: body.kind === "frequency" ? body.visitsEvery : null,
      reward_valid_days: body.rewardValidDays,
      referral_benefit_text: body.kind === "referral" ? body.referralBenefitText : null,
      discount_type: body.discountType, discount_value: body.discountValue,
      referral_discount_type: body.kind === "referral" ? body.referralDiscountType : "none",
      referral_discount_value: body.kind === "referral" ? body.referralDiscountValue : 0,
      starts_at: body.startsAt, ends_at: body.endsAt, created_by: session.userId,
    })
    if (result.error?.code === "23505" && result.error.message.includes("one_active_referral_campaign")) {
      throw new HTTPException(409, { message: "Ya hay una campaña de referidos activa. Paúsala antes de publicar otra." })
    }
    unwrap(result, 400)
    return c.json({ ok: true }, 201)
  })

  app.patch("/api/owner/promotions/:id", async (c) => {
    const session = await requireRole(c, "owner")
    const id = uuid.parse(c.req.param("id"))
    const body = v.promotionPatch.parse(await c.req.json())
    let changes: Record<string, unknown>
    if ("active" in body) changes = { active: body.active }
    else {
      const existing = unwrap<{ kind: string } | null>(await session.db.from("promotions").select("kind").eq("id", id).maybeSingle())
      if (!existing) throw new HTTPException(404, { message: "Promoción no encontrada." })
      if (existing.kind !== body.kind) throw new HTTPException(409, { message: "El tipo de una campaña existente no puede cambiar. Crea otra campaña para ese beneficio." })
      changes = {
        title: body.title, description: body.description, benefit_text: body.benefitText,
        branch_id: body.branchId, visits_every: body.kind === "frequency" ? body.visitsEvery : null,
        reward_valid_days: body.rewardValidDays,
        referral_benefit_text: body.kind === "referral" ? body.referralBenefitText : null,
        discount_type: body.discountType, discount_value: body.discountValue,
        referral_discount_type: body.kind === "referral" ? body.referralDiscountType : "none",
        referral_discount_value: body.kind === "referral" ? body.referralDiscountValue : 0,
        starts_at: body.startsAt, ends_at: body.endsAt,
      }
    }
    const result = await session.db.from("promotions").update(changes).eq("id", id).select("id").maybeSingle()
    if (result.error?.code === "23505" && result.error.message.includes("one_active_referral_campaign")) throw new HTTPException(409, { message: "Ya hay una campaña de referidos activa. Paúsala antes de activar otra." })
    const updated = unwrap<{ id: string } | null>(result, 400)
    if (!updated) throw new HTTPException(404, { message: "Promoción no encontrada." })
    return c.json({ ok: true })
  })

  app.post("/api/owner/coupons/redeem", async (c) => {
    const session = await requireRole(c, "owner")
    const { code } = v.redeemCoupon.parse(await c.req.json())
    const coupon = unwrap<{ id: string; promotion_id: string; status: string; expires_at: string } | null>(await session.db.from("coupons").select("id,promotion_id,status,expires_at").eq("code", code).maybeSingle())
    if (!coupon) throw new HTTPException(404, { message: "No encontramos ese cupón." })
    if (coupon.status === "redeemed") throw new HTTPException(409, { message: "Este cupón ya fue canjeado." })
    if (Date.now() >= Date.parse(coupon.expires_at)) throw new HTTPException(409, { message: "Este cupón ya venció." })
    const promotion = unwrap<{ active: boolean; starts_at: string; ends_at: string } | null>(await session.db.from("promotions").select("active,starts_at,ends_at").eq("id", coupon.promotion_id).maybeSingle())
    if (!promotion?.active || Date.now() < Date.parse(promotion.starts_at) || Date.now() > Date.parse(promotion.ends_at)) {
      throw new HTTPException(409, { message: "La promoción ya no está vigente." })
    }
    const redeemed = unwrap<{ id: string } | null>(await session.db.from("coupons").update({ status: "redeemed" }).eq("id", coupon.id).eq("status", "available").select("id").maybeSingle(), 400)
    if (!redeemed) throw new HTTPException(409, { message: "Este cupón ya fue canjeado." })
    return c.json({ ok: true })
  })

  app.post("/api/owner/branches", async (c) => {
    const session = await requireRole(c, "owner")
    const body = v.branch.parse(await c.req.json())
    const branch = unwrap<{ id: string }>(await session.db.from("branches").insert({ name: body.name, slug: slugify(body.name), location_label: body.locationLabel, address: body.address, whatsapp: body.whatsapp, active: body.active ?? false }).select("id").single(), 400)
    invalidateCatalog()
    return c.json(branch, 201)
  })

  app.patch("/api/owner/branches/:id", async (c) => {
    const session = await requireRole(c, "owner")
    const id = uuid.parse(c.req.param("id"))
    const body = v.branch.parse(await c.req.json())
    const updated = unwrap<{ id: string } | null>(await session.db.from("branches").update({ name: body.name, location_label: body.locationLabel, address: body.address, whatsapp: body.whatsapp, active: body.active }).eq("id", id).select("id").maybeSingle(), 400)
    if (!updated) throw new HTTPException(404, { message: "Sucursal no encontrada." })
    invalidateCatalog()
    return c.json({ ok: true })
  })

  app.put("/api/owner/branches/:id/hours", async (c) => {
    const session = await requireRole(c, "owner")
    const id = uuid.parse(c.req.param("id"))
    const body = v.branchHours.parse(await c.req.json())
    ensureHours(body.hours)
    if (new Set(body.hours.map((hour) => hour.weekday)).size !== 7) throw new HTTPException(400, { message: "Incluye cada día de la semana una vez." })
    unwrap(await session.db.from("branch_hours").upsert(body.hours.map((hour) => ({
      branch_id: id, weekday: hour.weekday, closed: hour.closed,
      opens_at: hour.closed ? null : hour.opensAt, closes_at: hour.closed ? null : hour.closesAt,
    })), { onConflict: "branch_id,weekday" }), 400)
    invalidateCatalog()
    return c.json({ ok: true })
  })

  app.post("/api/owner/services", async (c) => {
    const session = await requireRole(c, "owner")
    const body = v.service.parse(await c.req.json())
    unwrap(await session.db.from("services").insert({ name: body.name, description: body.description, duration_minutes: body.durationMinutes, price: body.price, points: body.points, active: body.active ?? true }), 400)
    invalidateCatalog()
    return c.json({ ok: true }, 201)
  })

  app.patch("/api/owner/services/:id", async (c) => {
    const session = await requireRole(c, "owner")
    const id = uuid.parse(c.req.param("id"))
    const body = v.service.parse(await c.req.json())
    const updated = unwrap<{ id: string } | null>(await session.db.from("services").update({ name: body.name, description: body.description, duration_minutes: body.durationMinutes, price: body.price, points: body.points, active: body.active }).eq("id", id).select("id").maybeSingle(), 400)
    if (!updated) throw new HTTPException(404, { message: "Servicio no encontrado." })
    invalidateCatalog()
    return c.json({ ok: true })
  })

  app.post("/api/owner/barbers", async (c) => {
    const session = await requireRole(c, "owner")
    const body = v.barber.extend({ branchId: uuid }).parse(await c.req.json())
    await ensureAssignable(session.db, body.userId)
    const created = unwrap<{ id: string }>(await session.db.from("barbers").insert({ display_name: body.displayName, specialty: body.specialty, bio: body.bio, user_id: body.userId, active: body.active ?? true, is_demo: false }).select("id").single(), 400)
    try {
      unwrap(await session.db.from("barber_branches").insert({ barber_id: created.id, branch_id: body.branchId }), 400)
      const hours = unwrap<{ weekday: number; opens_at: string | null; closes_at: string | null; closed: boolean }[]>(await session.db.from("branch_hours").select("weekday,opens_at,closes_at,closed").eq("branch_id", body.branchId))
      const rows = hours.filter((hour) => !hour.closed && hour.opens_at && hour.closes_at).map((hour) => ({ barber_id: created.id, branch_id: body.branchId, weekday: hour.weekday, opens_at: hour.opens_at!, closes_at: hour.closes_at! }))
      if (rows.length) unwrap(await session.db.from("barber_hours").insert(rows), 400)
      if (body.userId) unwrap(await session.db.from("staff_roles").upsert({ user_id: body.userId, role: "barber" }), 400)
    } catch (error) {
      await session.db.from("barbers").delete().eq("id", created.id)
      throw error
    }
    invalidateCatalog()
    return c.json({ ok: true }, 201)
  })

  app.patch("/api/owner/barbers/:id", async (c) => {
    const session = await requireRole(c, "owner")
    const id = uuid.parse(c.req.param("id"))
    const body = v.barber.parse(await c.req.json())
    await ensureAssignable(session.db, body.userId)
    const previous = unwrap<{ user_id: string | null } | null>(await session.db.from("barbers").select("user_id").eq("id", id).maybeSingle())
    if (!previous) throw new HTTPException(404, { message: "Barbero no encontrado." })
    unwrap(await session.db.from("barbers").update({ display_name: body.displayName, specialty: body.specialty, bio: body.bio, user_id: body.userId, active: body.active, is_demo: false }).eq("id", id), 400)
    if (body.userId) unwrap(await session.db.from("staff_roles").upsert({ user_id: body.userId, role: "barber" }), 400)
    if (previous.user_id && previous.user_id !== body.userId) unwrap(await session.db.from("staff_roles").delete().eq("user_id", previous.user_id).eq("role", "barber"), 400)
    invalidateCatalog()
    return c.json({ ok: true })
  })

  app.put("/api/owner/barbers/:id/branches", async (c) => {
    const session = await requireRole(c, "owner")
    const id = uuid.parse(c.req.param("id"))
    const body = v.barberBranches.parse(await c.req.json())
    const desired = [...new Set(body.branchIds)]
    const before = unwrap<{ branch_id: string }[]>(await session.db.from("barber_branches").select("branch_id").eq("barber_id", id)).map((item) => item.branch_id)
    const toAdd = desired.filter((branchId) => !before.includes(branchId))
    const toRemove = before.filter((branchId) => !desired.includes(branchId))
    for (const branchId of toAdd) {
      unwrap(await session.db.from("barber_branches").insert({ barber_id: id, branch_id: branchId }), 400)
      const hours = unwrap<{ weekday: number; opens_at: string | null; closes_at: string | null; closed: boolean }[]>(await session.db.from("branch_hours").select("weekday,opens_at,closes_at,closed").eq("branch_id", branchId))
      const rows = hours.filter((hour) => !hour.closed && hour.opens_at && hour.closes_at).map((hour) => ({ barber_id: id, branch_id: branchId, weekday: hour.weekday, opens_at: hour.opens_at!, closes_at: hour.closes_at! }))
      if (rows.length) unwrap(await session.db.from("barber_hours").insert(rows), 400)
    }
    for (const branchId of toRemove) unwrap(await session.db.from("barber_branches").delete().eq("barber_id", id).eq("branch_id", branchId), 400)
    invalidateCatalog()
    return c.json({ ok: true })
  })

  app.put("/api/owner/barbers/:id/hours", async (c) => {
    const session = await requireRole(c, "owner")
    const id = uuid.parse(c.req.param("id"))
    const body = v.barberHours.parse(await c.req.json())
    ensureHours(body.hours)
    if (new Set(body.hours.map((hour) => hour.weekday)).size !== 7) throw new HTTPException(400, { message: "Incluye cada día de la semana una vez." })
    const closed = body.hours.filter((hour) => hour.closed).map((hour) => hour.weekday)
    const open = body.hours.filter((hour) => !hour.closed).map((hour) => ({ barber_id: id, branch_id: body.branchId, weekday: hour.weekday, opens_at: hour.opensAt!, closes_at: hour.closesAt! }))
    if (closed.length) unwrap(await session.db.from("barber_hours").delete().eq("barber_id", id).eq("branch_id", body.branchId).in("weekday", closed), 400)
    if (open.length) unwrap(await session.db.from("barber_hours").upsert(open, { onConflict: "barber_id,branch_id,weekday" }), 400)
    invalidateCatalog()
    return c.json({ ok: true })
  })
}

async function ensureAssignable(db: Awaited<ReturnType<typeof requireRole>>["db"], userId: string | null) {
  if (!userId) return
  const role = unwrap<{ role: string } | null>(await db.from("staff_roles").select("role").eq("user_id", userId).maybeSingle())
  if (role && role.role !== "barber") throw new HTTPException(409, { message: "Esta cuenta ya tiene otro rol del equipo." })
}
