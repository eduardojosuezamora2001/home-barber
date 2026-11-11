import type { DiscountDefinition } from "./types"

const money = new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 2 })
const number = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 })

export function discountLabel(discount: DiscountDefinition) {
  if (discount.discount_type === "percentage") return `${number.format(Number(discount.discount_value))}% de descuento`
  if (discount.discount_type === "fixed") return `${money.format(Number(discount.discount_value))} de descuento`
  return "Sin descuento monetario configurado"
}

export function calculateDiscount(subtotal: number, discount: DiscountDefinition | null) {
  if (!discount || discount.discount_type === "none" || !Number.isFinite(subtotal) || subtotal <= 0) return 0
  const cents = Math.round(subtotal * 100)
  const value = Math.round(Number(discount.discount_value) * 100)
  if (!Number.isFinite(value) || value <= 0) return 0
  const amount = discount.discount_type === "percentage" ? Math.round(cents * value / 10000) : value
  return Math.min(cents, Math.max(0, amount)) / 100
}
