import { z } from "zod"

export const crmId = z.uuid()
const dateTime = z.iso.datetime({ offset: true })
const optionalEmail = z.email().trim().max(254).nullable().optional()
const optionalPhone = z.string().trim().transform((value) => value.replace(/[\s()+.-]/g, ""))
  .pipe(z.string().regex(/^\d{8,15}$/, "Ingresa un WhatsApp de 8 a 15 dígitos.")).nullable().optional()
const page = z.coerce.number().int().min(1).max(100000).default(1)
const pageSize = z.coerce.number().int().min(1).max(100).default(25)
const queryBoolean = z.union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")]).default(false)

export const listQuery = z.object({
  page,
  pageSize,
  branchId: crmId.optional(),
  q: z.string().trim().max(100).optional(),
  includeDemo: queryBoolean,
  marketingEligible: queryBoolean,
  minSpent: z.coerce.number().finite().min(0).optional(),
  maxSpent: z.coerce.number().finite().min(0).optional(),
  spentFrom: z.iso.date().optional(),
  spentTo: z.iso.date().optional(),
  minAttendances: z.coerce.number().int().min(0).optional(),
  maxAttendances: z.coerce.number().int().min(0).optional(),
  attendanceFrom: z.iso.date().optional(),
  attendanceTo: z.iso.date().optional(),
}).superRefine((value, ctx) => {
  if (value.minSpent !== undefined && value.maxSpent !== undefined && value.minSpent > value.maxSpent) ctx.addIssue({ code: "custom", path: ["maxSpent"], message: "El gasto máximo debe ser mayor o igual al mínimo." })
  if (value.minAttendances !== undefined && value.maxAttendances !== undefined && value.minAttendances > value.maxAttendances) ctx.addIssue({ code: "custom", path: ["maxAttendances"], message: "La asistencia máxima debe ser mayor o igual al mínimo." })
  if (value.spentFrom && value.spentTo && value.spentFrom > value.spentTo) ctx.addIssue({ code: "custom", path: ["spentTo"], message: "La fecha final debe ser igual o posterior a la inicial." })
  if (value.attendanceFrom && value.attendanceTo && value.attendanceFrom > value.attendanceTo) ctx.addIssue({ code: "custom", path: ["attendanceTo"], message: "La fecha final debe ser igual o posterior a la inicial." })
})
export const taskListQuery = listQuery.extend({
  status: z.enum(["open", "done", "cancelled"]).optional(),
  dueBefore: dateTime.optional(),
})
export const inquiryListQuery = listQuery.extend({
  status: z.enum(["new", "contacted", "booked", "lost"]).optional(),
})
export const recipientListQuery = z.object({ page, pageSize })

export const contactCreate = z.strictObject({
  fullName: z.string().trim().min(2).max(100),
  email: optionalEmail,
  phone: optionalPhone,
  source: z.enum(["profile", "web", "manual", "csv", "whatsapp", "referral"]).default("manual"),
  branchId: crmId.optional(),
})
export const contactImportRow = z.strictObject({
  ...contactCreate.shape,
  consent: z.strictObject({
    status: z.enum(["granted", "revoked", "unknown"]),
    source: z.string().trim().min(2).max(80),
    evidence: z.string().trim().max(500).nullable().optional(),
  }).refine((value) => value.status !== "granted" || (value.evidence?.trim().length ?? 0) >= 8,
    "Se necesita evidencia para importar consentimiento comercial.").optional(),
})
export const contactPatch = z.strictObject({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: optionalEmail,
  phone: optionalPhone,
  source: z.enum(["profile", "web", "manual", "csv", "whatsapp", "referral"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.")
export const contactImport = z.strictObject({
  rows: z.array(contactImportRow).min(1).max(200),
  dryRun: z.boolean().default(true),
})
export const consentUpdate = z.strictObject({
  status: z.enum(["granted", "revoked", "unknown"]),
  source: z.string().trim().min(2).max(80),
  evidence: z.string().trim().max(500).nullable().optional(),
}).refine((value) => value.status !== "granted" || (value.evidence?.trim().length ?? 0) >= 8,
  "Registra cómo se obtuvo el consentimiento antes de habilitar mensajes comerciales.")

export const inquiryCreate = z.strictObject({
  contactId: crmId,
  branchId: crmId,
  serviceId: crmId.nullable().optional(),
  preferredAt: dateTime.nullable().optional(),
  message: z.string().trim().max(1000).default(""),
  source: z.string().trim().min(2).max(60).default("manual"),
})
export const inquiryPatch = z.strictObject({ status: z.enum(["new", "contacted", "booked", "lost"]) })

export const taskCreate = z.strictObject({
  contactId: crmId,
  branchId: crmId.optional(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).default(""),
  dueAt: dateTime,
  assignedTo: crmId.nullable().optional(),
})
export const taskPatch = z.strictObject({
  status: z.enum(["open", "done", "cancelled"]).optional(),
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  dueAt: dateTime.optional(),
  assignedTo: crmId.nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.")

export const activityCreate = z.strictObject({
  kind: z.enum(["note", "call", "whatsapp_opened", "whatsapp_sent_confirmed", "whatsapp_replied"]),
  body: z.string().trim().min(1).max(1000),
  branchId: crmId.optional(),
  isMarketing: z.boolean().default(false),
  occurredAt: dateTime.optional(),
})

export const publicInquiry = z.strictObject({
  branchId: crmId,
  serviceId: crmId,
  barberId: crmId,
  requestedAt: dateTime,
  customerName: z.string().trim().min(2).max(100),
  customerWhatsapp: z.string().trim().transform((value) => value.replace(/[\s()+.-]/g, ""))
    .pipe(z.string().regex(/^\d{8,15}$/, "Ingresa un WhatsApp de 8 a 15 dígitos.")),
  notes: z.string().trim().max(1000).default(""),
  marketingConsent: z.boolean().default(false),
})

export const campaignCreate = z.strictObject({
  branchId: crmId.optional(),
  name: z.string().trim().min(3).max(120),
  goal: z.string().trim().min(3).max(300),
  messageTemplate: z.string().trim().min(10).max(1500),
  discountType: z.enum(["none", "fixed", "percentage"]).default("none"),
  discountValue: z.number().finite().min(0).max(120000000).default(0),
  couponValidDays: z.number().int().min(1).max(365).default(30),
}).refine((value) => value.discountType !== "none" || value.discountValue === 0, "Un cupón sin descuento debe tener monto cero.")
  .refine((value) => value.discountType === "none" || value.discountValue > 0, "Indica el valor del descuento.")
  .refine((value) => value.discountType !== "percentage" || value.discountValue <= 100, "El porcentaje no puede superar 100%.")
export const campaignPatch = z.strictObject({
  name: z.string().trim().min(3).max(120).optional(),
  goal: z.string().trim().min(3).max(300).optional(),
  messageTemplate: z.string().trim().min(10).max(1500).optional(),
  status: z.enum(["draft", "active", "completed"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.")
export const recipientsCreate = z.strictObject({ contactIds: z.array(crmId).min(1).max(100) })
export const recipientPatch = z.strictObject({
  status: z.enum(["pending", "contacted", "responded", "booked", "converted", "skipped"]),
  notes: z.string().trim().max(1000).optional(),
})
export const serviceIntervalPatch = z.strictObject({
  returnDays: z.number().int().min(7).max(180),
  isDemo: z.boolean().default(false),
})
export const marketingSettingsPatch = z.strictObject({
  maxContacts7Days: z.number().int().min(0).max(30),
  maxContacts30Days: z.number().int().min(0).max(100),
  isDemo: z.boolean().default(false),
}).refine((value) => value.maxContacts30Days >= value.maxContacts7Days,
  "El límite de 30 días debe ser igual o mayor que el de 7 días.")
