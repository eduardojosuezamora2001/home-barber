import type { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { requireRole } from "./auth.js"
import { invalidateCatalog } from "./catalog.js"
import { unwrap } from "./db.js"
import { serviceReceipt } from "./validation.js"

const uuid = z.uuid()

export function registerManagerRoutes(app: Hono) {
  app.get("/api/manager/dashboard", async (c) => {
    const session = await requireRole(c, "manager")
    if (!session.branchId) throw new HTTPException(403, { message: "Tu cuenta no tiene una sucursal asignada." })
    const branchId = session.branchId
    const now = new Date()
    const costaRicaDay = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const dayStart = `${costaRicaDay}T06:00:00Z`
    const [branch, barbers, assignments, services, appointments, receipts] = await Promise.all([
      session.db.from("branches").select("id,name,location_label,address,whatsapp,timezone,active").eq("id", branchId).single(),
      session.db.from("barbers").select("id,display_name,specialty,active").order("display_name"),
      session.db.from("barber_branches").select("barber_id,branch_id").eq("branch_id", branchId),
      session.db.from("services").select("id,name,price,points,active").eq("active", true).order("sort_order"),
      session.db.from("appointment_requests").select("id,client_id,contact_id,barber_id,branch_id,requested_at,status,customer_name").eq("branch_id", branchId).in("status", ["confirmed", "completed"]).gte("requested_at", dayStart).lte("requested_at", now.toISOString()).order("requested_at", { ascending: false }).limit(200),
      session.db.from("service_receipts").select("id,number,branch_id,appointment_id,client_name,barber_name,total,issued_at").eq("branch_id", branchId).order("issued_at", { ascending: false }).limit(100),
    ])
    c.header("Cache-Control", "private, no-store")
    return c.json({ branch: unwrap(branch), barbers: unwrap(barbers), assignments: unwrap(assignments), services: unwrap(services), appointments: unwrap(appointments), receipts: unwrap(receipts) })
  })

  app.get("/api/manager/clients", async (c) => {
    const session = await requireRole(c, "manager")
    const email = z.email().max(254).parse(c.req.query("email"))
    const result = unwrap<{ id: string; full_name: string; email: string }[]>(await session.db.rpc("lookup_receipt_client", { p_email: email.trim().toLowerCase() }), 400)
    c.header("Cache-Control", "private, no-store")
    return c.json({ client: result[0] ?? null })
  })

  app.post("/api/manager/receipts", async (c) => {
    const session = await requireRole(c, "manager")
    if (!session.branchId) throw new HTTPException(403, { message: "Tu cuenta no tiene una sucursal asignada." })
    const body = serviceReceipt.parse(await c.req.json())
    if (!body.clientId && !body.crmContactId) throw new HTTPException(400, { message: "Selecciona un cliente del CRM." })
    const receipt = unwrap<{ id: string; number: number }>(await session.db.from("service_receipts").insert({
      branch_id: session.branchId, client_id: body.clientId, contact_id: body.crmContactId, barber_id: body.barberId,
      issued_by: session.userId, appointment_id: body.appointmentId, items: body.items, note: body.note,
    }).select("id,number").single(), 400)
    invalidateCatalog()
    return c.json(receipt, 201)
  })

  app.get("/api/manager/receipts/:id", async (c) => {
    const session = await requireRole(c, "manager")
    const id = uuid.parse(c.req.param("id"))
    const receipt = unwrap<Record<string, unknown> | null>(await session.db.from("service_receipts").select("*").eq("id", id).maybeSingle())
    if (!receipt) throw new HTTPException(404, { message: "Comprobante no encontrado en tu sucursal." })
    c.header("Cache-Control", "private, no-store")
    return c.json(receipt)
  })
}
