import { createClient } from "@supabase/supabase-js"
import type { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { requireRole } from "./auth.js"
import { config } from "./config.js"
import { unwrap } from "./db.js"
import * as v from "./crm-validation.js"

type CrmRole = "owner" | "manager"
type StaffSession = Awaited<ReturnType<typeof requireRole>>
type Db = StaffSession["db"]
type Contact = {
  id: string; full_name: string; email: string | null; phone: string | null
  source: string; profile_id: string | null; is_demo: boolean; created_at: string; updated_at: string
}
type Campaign = { id: string; branch_id: string; status: "draft" | "active" | "completed"; promotion_id: string | null; discount_type: string; discount_value: number }

function branchFor(session: StaffSession, requested: string | undefined, required = false): string | undefined {
  if (session.role === "manager") {
    if (!session.branchId) throw new HTTPException(403, { message: "Tu cuenta no tiene una sucursal asignada." })
    if (requested && requested !== session.branchId) throw new HTTPException(403, { message: "No tienes acceso a esa sucursal." })
    return session.branchId
  }
  if (required && !requested) throw new HTTPException(400, { message: "Selecciona una sucursal." })
  return requested
}

function pagination(page: number, pageSize: number) {
  return { from: (page - 1) * pageSize, to: page * pageSize - 1 }
}

function countOf(result: { count: number | null; error: { message: string } | null }) {
  if (result.error) throw new HTTPException(502, { message: result.error.message })
  return result.count ?? 0
}

async function contactInBranch(db: Db, contactId: string, branchId: string) {
  const membership = unwrap<{ contact_id: string } | null>(
    await db.from("crm_contact_branches").select("contact_id").eq("contact_id", contactId)
      .eq("branch_id", branchId).maybeSingle(), 400)
  if (!membership) throw new HTTPException(404, { message: "Contacto no encontrado en esta sucursal." })
}

async function scopedContact(session: StaffSession, contactId: string, branchId?: string) {
  if (session.role === "manager") await contactInBranch(session.db, contactId, branchFor(session, branchId, true)!)
  else if (branchId) await contactInBranch(session.db, contactId, branchId)
  const contact = unwrap<Contact | null>(await session.db.from("crm_contacts")
    .select("id,full_name,email,phone,source,profile_id,is_demo,created_at,updated_at")
    .eq("id", contactId).maybeSingle())
  if (!contact) throw new HTTPException(404, { message: "Contacto no encontrado." })
  return contact
}

async function scopedCampaign(session: StaffSession, campaignId: string) {
  const campaign = unwrap<Campaign | null>(await session.db.from("crm_campaigns")
    .select("id,branch_id,status,promotion_id,discount_type,discount_value").eq("id", campaignId).maybeSingle())
  if (!campaign || (session.role === "manager" && campaign.branch_id !== session.branchId)) {
    throw new HTTPException(404, { message: "Campaña no encontrada." })
  }
  return campaign
}

async function marketEligibility(db: Db, contactId: string) {
  const rows = unwrap<{ allowed: boolean; reason: string | null; warning: string | null }[] | {
    allowed: boolean; reason: string | null; warning: string | null
  } | null>(await db.rpc("crm_market_eligibility", { p_contact_id: contactId }), 400)
  const result = Array.isArray(rows) ? rows[0] : rows
  if (!result?.allowed) throw new HTTPException(409, { message: result?.reason || "El contacto no puede recibir mensajes comerciales." })
  return result
}

async function createContact(session: StaffSession, body: z.infer<typeof v.contactCreate>, consent?: z.infer<typeof v.consentUpdate>) {
  const branchId = branchFor(session, body.branchId, true)!
  const id = unwrap<string>(await session.db.rpc("crm_create_contact", {
    p_branch_id: branchId, p_full_name: body.fullName, p_email: body.email ?? null,
    p_phone: body.phone ?? null, p_source: body.source,
    p_consent_status: consent?.status ?? null,
    p_consent_source: consent?.source ?? null,
    p_consent_evidence: consent?.evidence ?? null,
  }), 400)
  return scopedContact(session, id, branchId)
}

export function registerCrmRoutes(app: Hono) {
  for (const role of ["owner", "manager"] as const) registerStaffCrmRoutes(app, role)
  registerOwnerCrmRoutes(app)
  registerPublicInquiryRoute(app)
}

function registerStaffCrmRoutes(app: Hono, role: CrmRole) {
  const root = `/api/${role}/crm`

  app.get(`${root}/summary`, async (c) => {
    const session = await requireRole(c, role)
    const branchId = branchFor(session, c.req.query("branchId"))
    const now = new Date().toISOString()
    const contacts = branchId
      ? session.db.from("crm_contacts").select("id,crm_contact_branches!inner(branch_id)", { count: "exact", head: true })
        .eq("crm_contact_branches.branch_id", branchId).eq("is_demo", false)
      : session.db.from("crm_contacts").select("id", { count: "exact", head: true }).eq("is_demo", false)
    let inquiries = session.db.from("crm_inquiries").select("id,contact:crm_contacts!inner(is_demo)", { count: "exact", head: true }).eq("contact.is_demo", false).in("status", ["new", "contacted"])
    let tasksDue = session.db.from("crm_tasks").select("id,contact:crm_contacts!inner(is_demo)", { count: "exact", head: true }).eq("contact.is_demo", false).eq("status", "open").lte("due_at", now)
    let tasksOverdue = session.db.from("crm_tasks").select("id,contact:crm_contacts!inner(is_demo)", { count: "exact", head: true }).eq("contact.is_demo", false).eq("status", "open").lt("due_at", now)
    let campaigns = session.db.from("crm_campaigns").select("id", { count: "exact", head: true }).eq("status", "active")
    if (branchId) {
      inquiries = inquiries.eq("branch_id", branchId)
      tasksDue = tasksDue.eq("branch_id", branchId)
      tasksOverdue = tasksOverdue.eq("branch_id", branchId)
      campaigns = campaigns.eq("branch_id", branchId)
    }
    const [contactCount, inquiryCount, dueCount, overdueCount, campaignCount] = await Promise.all([
      contacts, inquiries, tasksDue, tasksOverdue, campaigns,
    ])
    return c.json({ contactsTotal: countOf(contactCount), inquiriesOpen: countOf(inquiryCount),
      tasksDue: countOf(dueCount), tasksOverdue: countOf(overdueCount), campaignsActive: countOf(campaignCount) })
  })

  app.get(`${root}/opportunities`, async (c) => {
    const session = await requireRole(c, role)
    const branchId = branchFor(session, c.req.query("branchId"))
    const now = new Date()
    const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString()
    let receiptQuery = session.db.from("service_receipts")
      .select("id,contact_id,branch_id,issued_at,items,contact:crm_contacts!inner(id,full_name,phone,is_demo)")
      .eq("contact.is_demo", false).gte("issued_at", cutoff)
      .order("issued_at", { ascending: false }).limit(500)
    let cancellationQuery = session.db.from("appointment_requests")
      .select("id,branch_id,barber_id,service_id,requested_at,status")
      .eq("status", "cancelled").gte("requested_at", now.toISOString())
      .lte("requested_at", new Date(now.getTime() + 7 * 86400000).toISOString())
      .order("requested_at", { ascending: true }).limit(25)
    if (branchId) {
      receiptQuery = receiptQuery.eq("branch_id", branchId)
      cancellationQuery = cancellationQuery.eq("branch_id", branchId)
    }
    const [receiptRows, intervalRows, cancellationRows] = await Promise.all([
      receiptQuery,
      session.db.from("crm_service_return_intervals").select("service_id,return_days,is_demo"),
      cancellationQuery,
    ])
    type Receipt = { id: string; contact_id: string; branch_id: string; issued_at: string; items: { serviceId?: string }[]; contact: { id: string; full_name: string; phone: string | null; is_demo: boolean } }
    const receipts = unwrap<Receipt[]>(receiptRows)
    const intervals = new Map(unwrap<{ service_id: string; return_days: number; is_demo: boolean }[]>(intervalRows)
      .map((row) => [row.service_id, row]))
    const latest = new Map<string, Receipt>()
    for (const receipt of receipts) if (receipt.contact_id && !latest.has(receipt.contact_id)) latest.set(receipt.contact_id, receipt)
    const ids = [...latest.keys()]
    let upcoming = new Set<string>()
    if (ids.length) {
      const future = unwrap<{ contact_id: string }[]>(await session.db.from("appointment_requests")
        .select("contact_id").in("contact_id", ids).in("status", ["pending", "confirmed"])
        .gt("requested_at", now.toISOString()).limit(1000))
      upcoming = new Set(future.map((item) => item.contact_id))
    }
    const rebooking: { contact_id: string; branch_id: string; name: string; phone: string | null; due_at: string; is_demo_interval: boolean }[] = []
    const inactive: typeof rebooking = []
    for (const receipt of latest.values()) {
      if (upcoming.has(receipt.contact_id)) continue
      const serviceIds = Array.isArray(receipt.items) ? receipt.items.map((item) => item.serviceId).filter((id): id is string => !!id) : []
      const rules = serviceIds.map((id) => intervals.get(id)).filter((rule): rule is NonNullable<typeof rule> => !!rule)
      const days = rules.length ? Math.min(...rules.map((rule) => rule.return_days)) : 28
      const dueAt = new Date(Date.parse(receipt.issued_at) + days * 86400000)
      const item = { contact_id: receipt.contact_id, branch_id: receipt.branch_id,
        name: receipt.contact.full_name, phone: receipt.contact.phone,
        due_at: dueAt.toISOString(), is_demo_interval: rules.some((rule) => rule.is_demo) || !rules.length }
      if (Date.parse(receipt.issued_at) >= now.getTime() - 86400000) rebooking.push(item)
      else if (dueAt.getTime() <= now.getTime()) inactive.push(item)
    }
    inactive.sort((a, b) => a.due_at.localeCompare(b.due_at))
    return c.json({ rebooking: rebooking.slice(0, 12), inactive: inactive.slice(0, 12),
      cancellations: unwrap(cancellationRows), sampleLimited: receipts.length === 500 })
  })

  app.get(`${root}/reports`, async (c) => {
    const session = await requireRole(c, role)
    const branchId = branchFor(session, c.req.query("branchId"))
    const since = new Date(Date.now() - 90 * 86400000).toISOString()
    let receiptQuery = session.db.from("service_receipts")
      .select("id,contact_id,total,issued_at,contact:crm_contacts!inner(is_demo)")
      .eq("contact.is_demo", false).gte("issued_at", since)
      .order("issued_at", { ascending: false }).limit(1000)
    let audienceQuery = session.db.from("crm_campaign_recipients")
      .select("id,status,contacted_at,contact:crm_contacts!inner(is_demo)")
      .eq("contact.is_demo", false).gte("contacted_at", since)
      .order("contacted_at", { ascending: false }).limit(1000)
    if (branchId) { receiptQuery = receiptQuery.eq("branch_id", branchId); audienceQuery = audienceQuery.eq("branch_id", branchId) }
    const [receiptRows, audienceRows] = await Promise.all([receiptQuery, audienceQuery])
    const receipts = unwrap<{ contact_id: string; total: number; issued_at: string }[]>(receiptRows)
    const audience = unwrap<{ status: string }[]>(audienceRows)
    const visits = new Map<string, number>()
    const months = new Map<string, { month: string; receipts: number; revenue: number }>()
    const monthFormat = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", timeZone: "America/Costa_Rica" })
    let revenue = 0
    for (const receipt of receipts) {
      visits.set(receipt.contact_id, (visits.get(receipt.contact_id) ?? 0) + 1)
      const amount = Number(receipt.total) || 0
      revenue += amount
      const parts = monthFormat.formatToParts(new Date(receipt.issued_at))
      const month = `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`
      const bucket = months.get(month) ?? { month, receipts: 0, revenue: 0 }
      bucket.receipts++; bucket.revenue += amount; months.set(month, bucket)
    }
    return c.json({ periodDays: 90, paidReceipts: receipts.length, documentedRevenue: revenue,
      customers: visits.size, customersWithMultipleReceipts: [...visits.values()].filter((count) => count >= 2).length,
      contacted: audience.filter((row) => ["contacted", "responded", "booked", "converted"].includes(row.status)).length,
      bookedReported: audience.filter((row) => ["booked", "converted"].includes(row.status)).length,
      returnedReported: audience.filter((row) => row.status === "converted").length,
      months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      sampleLimited: receipts.length === 1000 || audience.length === 1000 })
  })

  app.get(`${root}/contacts`, async (c) => {
    const session = await requireRole(c, role)
    const query = v.listQuery.parse(c.req.query())
    const branchId = branchFor(session, query.branchId)
    const result = unwrap<{ total: number; contacts: (Contact & { spent: number; attendances: number })[] }>(
      await session.db.rpc("crm_contact_metrics", {
        p_page: query.page, p_page_size: query.pageSize, p_branch_id: branchId ?? null,
        p_q: query.q?.replace(/[^\p{L}\p{N}@.+\-\s]/gu, "").trim() || null,
        p_min_spent: query.minSpent ?? null, p_max_spent: query.maxSpent ?? null,
        p_spent_from: query.spentFrom ?? null, p_spent_to: query.spentTo ?? null,
        p_min_attendances: query.minAttendances ?? null, p_max_attendances: query.maxAttendances ?? null,
        p_attendance_from: query.attendanceFrom ?? null, p_attendance_to: query.attendanceTo ?? null,
        p_include_demo: query.includeDemo && !query.marketingEligible,
        p_marketing_eligible: query.marketingEligible,
      }), 400)
    return c.json({ contacts: result.contacts ?? [], total: result.total ?? 0, page: query.page, pageSize: query.pageSize })
  })

  app.post(`${root}/contacts`, async (c) => {
    const session = await requireRole(c, role)
    const body = v.contactCreate.parse(await c.req.json())
    const branchId = branchFor(session, body.branchId, true)!
    if (await duplicateInBranch(session.db, branchId, body.phone ?? null, body.email?.toLowerCase() ?? null)) {
      throw new HTTPException(409, { message: "Ya existe un contacto con ese teléfono o correo en esta sucursal. Búscalo en el directorio." })
    }
    const contact = await createContact(session, body)
    return c.json({ contact }, 201)
  })

  app.get(`${root}/contacts/:id`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    const branchId = branchFor(session, c.req.query("branchId"))
    const contact = await scopedContact(session, id, branchId)
    let branches = session.db.from("crm_contact_branches").select("branch_id,created_at").eq("contact_id", id)
    let inquiries = session.db.from("crm_inquiries").select("*").eq("contact_id", id).order("created_at", { ascending: false }).limit(100)
    let tasks = session.db.from("crm_tasks").select("*").eq("contact_id", id).order("due_at", { ascending: false }).limit(100)
    let activities = session.db.from("crm_activities").select("*").eq("contact_id", id).order("occurred_at", { ascending: false }).limit(100)
    let appointments = session.db.from("appointment_requests").select("id,branch_id,barber_id,service_id,requested_at,status,created_at")
      .eq("contact_id", id).order("requested_at", { ascending: false }).limit(100)
    let receipts = session.db.from("service_receipts").select("id,number,branch_id,appointment_id,total,issued_at")
      .eq("contact_id", id).order("issued_at", { ascending: false }).limit(100)
    if (branchId) {
      branches = branches.eq("branch_id", branchId)
      inquiries = inquiries.eq("branch_id", branchId)
      tasks = tasks.eq("branch_id", branchId)
      activities = activities.eq("branch_id", branchId)
      appointments = appointments.eq("branch_id", branchId)
      receipts = receipts.eq("branch_id", branchId)
    }
    const [branchRows, consentRows, inquiryRows, taskRows, activityRows, appointmentRows, receiptRows] = await Promise.all([
      branches,
      session.db.from("crm_contact_consents").select("channel,status,source,evidence,updated_at,recorded_by").eq("contact_id", id),
      inquiries, tasks, activities, appointments, receipts,
    ])
    const visits = unwrap<{ status: string }[]>(appointmentRows).filter((row) => row.status === "completed")
    const receiptList = unwrap<{ appointment_id: string | null }[]>(receiptRows)
    return c.json({
      contact,
      branches: unwrap<{ branch_id: string }[]>(branchRows).map((row) => ({ id: row.branch_id })), consents: unwrap(consentRows),
      inquiries: unwrap(inquiryRows), tasks: unwrap(taskRows), activities: unwrap(activityRows),
      appointments: appointmentRows.data, receipts: receiptList,
      summary: { completedAppointments: visits.length, walkInReceipts: receiptList.filter((row) => !row.appointment_id).length,
        documentedReceipts: receiptList.length },
      hasMore: [inquiryRows, taskRows, activityRows, appointmentRows, receiptRows]
        .some((result) => Array.isArray(result.data) && result.data.length === 100),
    })
  })

  app.patch(`${root}/contacts/:id`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    await scopedContact(session, id)
    const body = v.contactPatch.parse(await c.req.json())
    const changes: Record<string, unknown> = {}
    if (body.fullName !== undefined) changes.full_name = body.fullName
    if (body.email !== undefined) changes.email = body.email
    if (body.phone !== undefined) changes.phone = body.phone
    if (body.source !== undefined) changes.source = body.source
    const contact = unwrap<Contact | null>(await session.db.from("crm_contacts").update(changes).eq("id", id)
      .select("id,full_name,email,phone,source,profile_id,is_demo,created_at,updated_at").maybeSingle(), 400)
    if (!contact) throw new HTTPException(404, { message: "Contacto no encontrado." })
    return c.json({ contact })
  })

  app.put(`${root}/contacts/:id/consents/whatsapp`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    await scopedContact(session, id)
    const body = v.consentUpdate.parse(await c.req.json())
    const consent = unwrap<Record<string, unknown>>(await session.db.from("crm_contact_consents").upsert({
      contact_id: id, channel: "whatsapp", status: body.status, source: body.source,
      evidence: body.evidence ?? "",
    }, { onConflict: "contact_id,channel" }).select("channel,status,source,evidence,updated_at,recorded_by").single(), 400)
    return c.json({ consent })
  })

  app.get(`${root}/contacts/:id/marketing-eligibility`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    await scopedContact(session, id)
    const rows = unwrap<{ allowed: boolean; reason: string | null; warning: string | null }[] | null>(
      await session.db.rpc("crm_market_eligibility", { p_contact_id: id }), 400)
    return c.json({ eligibility: Array.isArray(rows) ? rows[0] : rows })
  })

  app.post(`${root}/contacts/:id/activities`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    const body = v.activityCreate.parse(await c.req.json())
    const branchId = branchFor(session, body.branchId, true)!
    await scopedContact(session, id, branchId)
    let eligibilityWarning: string | null = null
    if (body.isMarketing && body.kind === "whatsapp_sent_confirmed") {
      const eligibility = await marketEligibility(session.db, id)
      eligibilityWarning = eligibility.warning
    }
    const activity = unwrap<Record<string, unknown>>(await session.db.from("crm_activities").insert({
      contact_id: id, branch_id: branchId, kind: body.kind, body: body.body,
      is_marketing: body.isMarketing,
      occurred_at: body.occurredAt ?? new Date().toISOString(),
    }).select("*").single(), 400)
    return c.json({ activity, eligibilityWarning }, 201)
  })

  app.get(`${root}/inquiries`, async (c) => {
    const session = await requireRole(c, role)
    const query = v.inquiryListQuery.parse(c.req.query())
    const branchId = branchFor(session, query.branchId)
    let request = session.db.from("crm_inquiries")
      .select("*,contact:crm_contacts!inner(id,full_name,phone,is_demo)", { count: "exact" })
    if (branchId) request = request.eq("branch_id", branchId)
    if (query.status) request = request.eq("status", query.status)
    if (!query.includeDemo) request = request.eq("contact.is_demo", false)
    const { from, to } = pagination(query.page, query.pageSize)
    const result = await request.order("created_at", { ascending: false }).range(from, to)
    return c.json({ inquiries: unwrap(result), total: result.count ?? 0, page: query.page, pageSize: query.pageSize })
  })

  app.post(`${root}/inquiries`, async (c) => {
    const session = await requireRole(c, role)
    const body = v.inquiryCreate.parse(await c.req.json())
    const branchId = branchFor(session, body.branchId, true)!
    await scopedContact(session, body.contactId, branchId)
    const inquiry = unwrap<Record<string, unknown>>(await session.db.from("crm_inquiries").insert({
      contact_id: body.contactId, branch_id: branchId, service_id: body.serviceId ?? null,
      preferred_at: body.preferredAt ?? null, message: body.message, source: body.source,
      status: "new",
    }).select("*").single(), 400)
    return c.json({ inquiry }, 201)
  })

  app.patch(`${root}/inquiries/:id`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    const body = v.inquiryPatch.parse(await c.req.json())
    let query = session.db.from("crm_inquiries").update({ status: body.status }).eq("id", id)
    const branchId = branchFor(session, undefined)
    if (branchId) query = query.eq("branch_id", branchId)
    const inquiry = unwrap<Record<string, unknown> | null>(await query.select("*").maybeSingle(), 400)
    if (!inquiry) throw new HTTPException(404, { message: "Consulta no encontrada." })
    return c.json({ inquiry })
  })

  app.get(`${root}/tasks`, async (c) => {
    const session = await requireRole(c, role)
    const query = v.taskListQuery.parse(c.req.query())
    const branchId = branchFor(session, query.branchId)
    let request = session.db.from("crm_tasks")
      .select("*,contact:crm_contacts!inner(id,full_name,phone,is_demo)", { count: "exact" })
    if (branchId) request = request.eq("branch_id", branchId)
    if (query.status) request = request.eq("status", query.status)
    if (query.dueBefore) request = request.lte("due_at", query.dueBefore)
    if (!query.includeDemo) request = request.eq("contact.is_demo", false)
    const { from, to } = pagination(query.page, query.pageSize)
    const result = await request.order("due_at", { ascending: true }).range(from, to)
    return c.json({ tasks: unwrap(result), total: result.count ?? 0, page: query.page, pageSize: query.pageSize })
  })

  app.post(`${root}/tasks`, async (c) => {
    const session = await requireRole(c, role)
    const body = v.taskCreate.parse(await c.req.json())
    const branchId = branchFor(session, body.branchId, true)!
    await scopedContact(session, body.contactId, branchId)
    const task = unwrap<Record<string, unknown>>(await session.db.from("crm_tasks").insert({
      contact_id: body.contactId, branch_id: branchId, title: body.title,
      description: body.description, due_at: body.dueAt, status: "open",
      assigned_to: body.assignedTo ?? session.userId,
    }).select("*").single(), 400)
    return c.json({ task }, 201)
  })

  app.patch(`${root}/tasks/:id`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    const body = v.taskPatch.parse(await c.req.json())
    const changes: Record<string, unknown> = {}
    if (body.status !== undefined) {
      changes.status = body.status
    }
    if (body.title !== undefined) changes.title = body.title
    if (body.description !== undefined) changes.description = body.description
    if (body.dueAt !== undefined) changes.due_at = body.dueAt
    if (body.assignedTo !== undefined) changes.assigned_to = body.assignedTo
    let request = session.db.from("crm_tasks").update(changes).eq("id", id)
    const branchId = branchFor(session, undefined)
    if (branchId) request = request.eq("branch_id", branchId)
    const task = unwrap<Record<string, unknown> | null>(await request.select("*").maybeSingle(), 400)
    if (!task) throw new HTTPException(404, { message: "Tarea no encontrada." })
    return c.json({ task })
  })

  app.get(`${root}/campaigns`, async (c) => {
    const session = await requireRole(c, role)
    const branchId = branchFor(session, c.req.query("branchId"))
    let request = session.db.from("crm_campaigns").select("*").order("created_at", { ascending: false }).limit(100)
    if (branchId) request = request.eq("branch_id", branchId)
    const campaigns = unwrap<Record<string, unknown>[]>(await request)
    return c.json({ campaigns })
  })

  app.post(`${root}/campaigns`, async (c) => {
    const session = await requireRole(c, role)
    const body = v.campaignCreate.parse(await c.req.json())
    const branchId = branchFor(session, body.branchId, true)!
    const campaign = unwrap<Record<string, unknown>>(await session.db.rpc("crm_create_campaign", {
      p_branch_id: branchId, p_name: body.name, p_goal: body.goal,
      p_message_template: body.messageTemplate, p_discount_type: body.discountType,
      p_discount_value: body.discountValue, p_coupon_valid_days: body.couponValidDays,
    }), 400)
    return c.json({ campaign }, 201)
  })

  app.patch(`${root}/campaigns/:id`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    const existing = await scopedCampaign(session, id)
    const body = v.campaignPatch.parse(await c.req.json())
    if (existing.status === "completed") throw new HTTPException(409, { message: "Una campaña finalizada no se puede editar." })
    if (existing.status !== "draft" && (body.name || body.goal || body.messageTemplate)) {
      throw new HTTPException(409, { message: "Pausa o termina la campaña antes de cambiar su contenido." })
    }
    const changes: Record<string, unknown> = {}
    if (body.name !== undefined) changes.name = body.name
    if (body.goal !== undefined) changes.goal = body.goal
    if (body.messageTemplate !== undefined) changes.message_template = body.messageTemplate
    if (body.status !== undefined) changes.status = body.status
    const campaign = unwrap<Record<string, unknown> | null>(await session.db.from("crm_campaigns").update(changes)
      .eq("id", id).eq("branch_id", existing.branch_id).select("*").maybeSingle(), 400)
    if (!campaign) throw new HTTPException(404, { message: "Campaña no encontrada." })
    return c.json({ campaign })
  })

  app.get(`${root}/campaigns/:id/recipients`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    const campaign = await scopedCampaign(session, id)
    const query = v.recipientListQuery.parse(c.req.query())
    const { from, to } = pagination(query.page, query.pageSize)
    const result = await session.db.from("crm_campaign_recipients")
      .select("*,contact:crm_contacts(id,full_name,phone,is_demo,profile_id)", { count: "exact" })
      .eq("campaign_id", id).eq("branch_id", campaign.branch_id)
      .order("created_at", { ascending: false }).range(from, to)
    const recipientRows = unwrap<Record<string, unknown>[]>(result)
    const profileIds = recipientRows.map((row) => (row.contact as { profile_id?: string | null } | null)?.profile_id).filter((value): value is string => !!value)
    const couponsByClient = new Map<string, string>()
    if (campaign.promotion_id && profileIds.length) {
      const coupons = unwrap<{ client_id: string; code: string }[]>(await session.db.from("coupons")
        .select("client_id,code").eq("promotion_id", campaign.promotion_id).in("client_id", profileIds))
      for (const coupon of coupons) couponsByClient.set(coupon.client_id, coupon.code)
    }
    const recipients = recipientRows.map((row) => ({
      ...row, coupon_code: couponsByClient.get((row.contact as { profile_id?: string | null } | null)?.profile_id ?? "") ?? null,
    }))
    return c.json({ recipients, total: result.count ?? 0, page: query.page, pageSize: query.pageSize })
  })

  app.post(`${root}/campaigns/:id/recipients`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    const campaign = await scopedCampaign(session, id)
    if (campaign.status !== "draft") throw new HTTPException(409, { message: "La audiencia se prepara antes de activar la campaña." })
    const { contactIds } = v.recipientsCreate.parse(await c.req.json())
    const uniqueIds = [...new Set(contactIds)]
    const warnings: { contactId: string; warning: string }[] = []
    const eligibleIds: string[] = []
    for (const contactId of uniqueIds) {
      const contact = await scopedContact(session, contactId, campaign.branch_id)
      if (campaign.promotion_id && !contact.profile_id) {
        warnings.push({ contactId, warning: "Los cupones solo se pueden emitir a clientes con cuenta." })
        continue
      }
      try {
        const eligibility = await marketEligibility(session.db, contactId)
        if (eligibility.warning) warnings.push({ contactId, warning: eligibility.warning })
        eligibleIds.push(contactId)
      } catch (cause) {
        if (cause instanceof HTTPException && cause.status === 409) warnings.push({ contactId, warning: cause.message })
        else throw cause
      }
    }
    const rows = eligibleIds.map((contactId) => ({
      campaign_id: id, contact_id: contactId, branch_id: campaign.branch_id, status: "pending",
    }))
    const recipients = rows.length ? unwrap<Record<string, unknown>[]>(await session.db.from("crm_campaign_recipients")
      .upsert(rows, { onConflict: "campaign_id,contact_id", ignoreDuplicates: true }).select("*"), 400) : []
    return c.json({ recipients, warnings }, 201)
  })

  app.patch(`${root}/campaigns/:id/recipients/:recipientId`, async (c) => {
    const session = await requireRole(c, role)
    const id = v.crmId.parse(c.req.param("id"))
    const recipientId = v.crmId.parse(c.req.param("recipientId"))
    const campaign = await scopedCampaign(session, id)
    const body = v.recipientPatch.parse(await c.req.json())
    const recipient = unwrap<{ contact_id: string; status: string } | null>(await session.db.from("crm_campaign_recipients")
      .select("contact_id,status").eq("id", recipientId).eq("campaign_id", id).eq("branch_id", campaign.branch_id)
      .maybeSingle())
    if (!recipient) throw new HTTPException(404, { message: "Destinatario no encontrado." })
    if (body.status === "contacted") {
      if (campaign.status !== "active") throw new HTTPException(409, { message: "Activa la campaña antes de registrar un envío." })
      await marketEligibility(session.db, recipient.contact_id)
    }
    const changes: Record<string, unknown> = { status: body.status }
    if (body.notes !== undefined) changes.notes = body.notes
    const updated = unwrap<Record<string, unknown> | null>(await session.db.from("crm_campaign_recipients")
      .update(changes).eq("id", recipientId).eq("campaign_id", id).eq("branch_id", campaign.branch_id)
      .select("*").maybeSingle(), 400)
    if (!updated) throw new HTTPException(404, { message: "Destinatario no encontrado." })
    return c.json({ recipient: updated })
  })

  app.get(`${root}/service-intervals`, async (c) => {
    const session = await requireRole(c, role)
    const intervals = unwrap<Record<string, unknown>[]>(await session.db.from("crm_service_return_intervals")
      .select("service_id,return_days,is_demo,updated_at,service:services(id,name,active)")
      .order("service_id"))
    return c.json({ intervals })
  })

  app.get(`${root}/marketing-settings`, async (c) => {
    const session = await requireRole(c, role)
    const settings = unwrap<Record<string, unknown> | null>(await session.db.from("crm_marketing_settings")
      .select("max_contacts_7_days,max_contacts_30_days,is_demo,updated_at").eq("id", true).maybeSingle())
    if (!settings) throw new HTTPException(503, { message: "Aún no hay configuración de marketing." })
    return c.json({ settings })
  })
}

async function duplicateInBranch(db: Db, branchId: string, phone: string | null, email: string | null) {
  for (const [column, value] of [["phone", phone], ["email", email]] as const) {
    if (!value) continue
    const duplicate = unwrap<{ id: string } | null>(await db.from("crm_contacts")
      .select("id,crm_contact_branches!inner(branch_id)")
      .eq("crm_contact_branches.branch_id", branchId).eq(column, value).limit(1).maybeSingle())
    if (duplicate) return duplicate.id
  }
  return null
}

function registerOwnerCrmRoutes(app: Hono) {
  app.patch("/api/owner/crm/service-intervals/:serviceId", async (c) => {
    const session = await requireRole(c, "owner")
    const serviceId = v.crmId.parse(c.req.param("serviceId"))
    const body = v.serviceIntervalPatch.parse(await c.req.json())
    const interval = unwrap<Record<string, unknown> | null>(await session.db.from("crm_service_return_intervals")
      .update({ return_days: body.returnDays, is_demo: body.isDemo })
      .eq("service_id", serviceId).select("*").maybeSingle(), 400)
    if (!interval) throw new HTTPException(404, { message: "Servicio sin intervalo configurado." })
    return c.json({ interval })
  })

  app.patch("/api/owner/crm/marketing-settings", async (c) => {
    const session = await requireRole(c, "owner")
    const body = v.marketingSettingsPatch.parse(await c.req.json())
    const settings = unwrap<Record<string, unknown> | null>(await session.db.from("crm_marketing_settings")
      .update({ max_contacts_7_days: body.maxContacts7Days, max_contacts_30_days: body.maxContacts30Days,
        is_demo: body.isDemo })
      .eq("id", true).select("*").maybeSingle(), 400)
    if (!settings) throw new HTTPException(503, { message: "Aún no hay configuración de marketing." })
    return c.json({ settings })
  })

  app.post("/api/owner/crm/imports", async (c) => {
    const session = await requireRole(c, "owner")
    const body = v.contactImport.parse(await c.req.json())
    const results: { row: number; status: "new" | "duplicate" | "created" | "failed"; contactId?: string; error?: string }[] = []
    for (const [index, row] of body.rows.entries()) {
      const branchId = branchFor(session, row.branchId, true)!
      const existingId = await duplicateInBranch(session.db, branchId, row.phone ?? null, row.email ?? null)
      if (existingId) {
        results.push({ row: index + 1, status: "duplicate", contactId: existingId })
        continue
      }
      if (body.dryRun) {
        results.push({ row: index + 1, status: "new" })
        continue
      }
      try {
        const contact = await createContact(session, row, row.consent)
        results.push({ row: index + 1, status: "created", contactId: contact.id })
      } catch (error) {
        results.push({ row: index + 1, status: "failed", error: error instanceof Error ? error.message : "No se pudo importar." })
      }
    }
    return c.json({ dryRun: body.dryRun, results,
      created: results.filter((row) => row.status === "created").length,
      duplicates: results.filter((row) => row.status === "duplicate").length,
      failed: results.filter((row) => row.status === "failed").length })
  })
}

function registerPublicInquiryRoute(app: Hono) {
  app.post("/api/inquiries", async (c) => {
    if (!config.supabaseSecretKey) {
      throw new HTTPException(503, { message: "Las consultas en línea aún no están disponibles. Contacta la sucursal por WhatsApp." })
    }
    const body = v.publicInquiry.parse(await c.req.json())
    const requestedAt = Date.parse(body.requestedAt)
    if (requestedAt <= Date.now() || requestedAt > Date.now() + 90 * 24 * 60 * 60 * 1000) {
      throw new HTTPException(400, { message: "Elige una fecha futura dentro de los próximos 90 días." })
    }
    // Only this public intake RPC uses the server secret. Staff CRM queries use the caller JWT.
    const intake = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const inquiryId = unwrap<string>(await intake.rpc("crm_submit_public_inquiry", {
      p_branch_id: body.branchId, p_full_name: body.customerName,
      p_phone: body.customerWhatsapp, p_service_id: body.serviceId,
      p_barber_id: body.barberId, p_preferred_at: body.requestedAt,
      p_message: body.notes, p_marketing_opt_in: body.marketingConsent,
    }), 400)
    return c.json({ inquiryId }, 201)
  })
}
