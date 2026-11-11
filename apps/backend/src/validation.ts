import { z } from "zod"

const uuid = z.uuid()
export const receiptId = uuid
export const receiptPage = z.coerce.number().int().min(1).max(100000).default(1)
const dateTime = z.iso.datetime({ offset: true })
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Hora inválida")
const phone = z.string().regex(/^\d{8,15}$/, "Número de WhatsApp inválido")

export const credentials = z.object({ email: z.email().max(254), password: z.string().min(8).max(128) })
export const registration = credentials.extend({ fullName: z.string().trim().min(2).max(100) })
export const authTokens = z.object({ accessToken: z.string().min(10).max(8192), refreshToken: z.string().min(10).max(2048) })
export const passwordResetRequest = z.object({ email: z.email().max(254) })
export const newPassword = z.object({ password: z.string().min(8).max(128) })
export const appointment = z.object({
  branchId: uuid, barberId: uuid, serviceId: uuid, requestedAt: dateTime,
  customerName: z.string().trim().min(2).max(100), customerWhatsapp: phone,
  notes: z.string().trim().max(1000).default(""),
})
export const appointmentStatus = z.object({ status: z.enum(["confirmed", "completed", "cancelled"]) })
export const profile = z.strictObject({
  fullName: z.string().trim().min(2, "Escribe un nombre de al menos 2 caracteres.").max(100, "El nombre no puede superar 100 caracteres."),
  phone: z.string().trim().max(40).transform((value) => value.replace(/[\s()+.-]/g, "") || null)
    .pipe(z.string().regex(/^\d{8,15}$/, "Ingresa un WhatsApp de 8 a 15 dígitos.").nullable()).nullable(),
})
function validateCampaignDiscounts(value: { discountType: string; discountValue: number; kind: string; referralDiscountType: string | null; referralDiscountValue: number | null }, ctx: z.RefinementCtx) {
  if (value.discountType === "percentage" && value.discountValue > 100) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "El porcentaje no puede superar 100%." })
  if (value.kind === "referral") {
    if (!value.referralDiscountType || value.referralDiscountValue === null) ctx.addIssue({ code: "custom", path: ["referralDiscountValue"], message: "Define el descuento para quien invita." })
    if (value.referralDiscountType === "percentage" && (value.referralDiscountValue ?? 0) > 100) ctx.addIssue({ code: "custom", path: ["referralDiscountValue"], message: "El porcentaje no puede superar 100%." })
  }
}
export const promotion = z.object({
  title: z.string().trim().min(3).max(120), description: z.string().trim().max(800),
  benefitText: z.string().trim().min(3).max(200), branchId: uuid.nullable(),
  kind: z.enum(["welcome", "frequency", "referral"]),
  visitsEvery: z.number().int().min(2).max(100).nullable(),
  rewardValidDays: z.number().int().min(1).max(365),
  referralBenefitText: z.string().trim().min(3).max(200).nullable(),
  discountType: z.enum(["fixed", "percentage"]),
  discountValue: z.number().finite().min(0.01).max(120000000).multipleOf(0.01),
  referralDiscountType: z.enum(["fixed", "percentage"]).nullable().default(null),
  referralDiscountValue: z.number().finite().min(0.01).max(120000000).multipleOf(0.01).nullable().default(null),
  startsAt: dateTime, endsAt: dateTime,
}).refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), "La fecha de fin debe ser posterior al inicio.")
  .refine((value) => value.kind !== "frequency" || value.visitsEvery !== null, "Indica cada cuántas visitas se entrega una recompensa.")
  .refine((value) => value.kind !== "referral" || value.referralBenefitText !== null, "Define el beneficio para quien invita.")
  .superRefine(validateCampaignDiscounts)
export const promotionEdit = z.strictObject({ ...promotion.shape, kind: z.enum(["legacy", "welcome", "frequency", "referral"]) })
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), "La fecha de fin debe ser posterior al inicio.")
  .refine((value) => value.kind !== "frequency" || value.visitsEvery !== null, "Indica cada cuántas visitas se entrega una recompensa.")
  .refine((value) => value.kind !== "referral" || value.referralBenefitText !== null, "Define el beneficio para quien invita.")
  .superRefine(validateCampaignDiscounts)
export const promotionPatch = z.union([z.strictObject({ active: z.boolean() }), promotionEdit])
export const branch = z.object({ name: z.string().trim().min(2).max(80), locationLabel: z.string().trim().min(2).max(180), address: z.string().trim().max(300).nullable(), whatsapp: phone, active: z.boolean().optional() })
export const branchHours = z.object({ hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), closed: z.boolean(), opensAt: time.nullable(), closesAt: time.nullable() })).length(7) })
export const service = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(500), durationMinutes: z.number().int().min(15).max(240), price: z.number().min(0).max(1000000).nullable(), points: z.number().int().min(0).max(100000), active: z.boolean().optional() })
export const barber = z.object({ displayName: z.string().trim().min(2).max(100), specialty: z.string().trim().max(120), bio: z.string().trim().max(600), userId: uuid.nullable(), active: z.boolean().optional() })
export const barberBranches = z.object({ branchIds: z.array(uuid).min(1).max(30) })
export const barberHours = z.object({ branchId: uuid, hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), closed: z.boolean(), opensAt: time.nullable(), closesAt: time.nullable() })).length(7) })
export const claimCoupon = z.object({ promotionId: uuid })
export const redeemCoupon = z.object({ code: z.string().trim().toUpperCase().regex(/^HOME-[A-Z0-9]{10}$/) })
export const referral = z.object({ code: z.string().trim().toUpperCase().regex(/^INV-[A-F0-9]{12}$/, "Revisa el código de invitación.") })
export const managerAssignment = z.object({ userId: uuid, branchId: uuid })
export const serviceReceipt = z.object({
  clientId: uuid.nullable(), crmContactId: uuid.nullable().default(null), barberId: uuid, appointmentId: uuid.nullable(), note: z.string().trim().max(500),
  items: z.array(z.object({ serviceId: uuid, quantity: z.number().int().min(1).max(10), unitPrice: z.number().finite().min(0).max(1000000) })).min(1).max(12),
})
export const ownerServiceReceipt = z.strictObject({ ...serviceReceipt.shape,
  branchId: uuid,
  couponCode: redeemCoupon.shape.code.nullable().default(null),
})
export const receiptCouponQuery = z.object({ clientId: uuid, branchId: uuid, code: redeemCoupon.shape.code.optional() })
