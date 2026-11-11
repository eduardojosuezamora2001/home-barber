import { useEffect, useState } from "react"
import type { Coupon, Promotion } from "./types"

export const promotionLabels: Record<Promotion["kind"], string> = {
  welcome: "Bienvenida", frequency: "Por visitas", referral: "Referidos", legacy: "Promoción anterior", targeted: "Cupón de campaña",
}

export function useRewardTime() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const update = () => setNow(Date.now())
    const timer = window.setInterval(update, 30_000)
    window.addEventListener("focus", update)
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update) }
  }, [])
  return now
}

export function campaignIsActive(promotion: Promotion, now: number) {
  return promotion.active && Date.parse(promotion.starts_at) <= now && now < Date.parse(promotion.ends_at)
}

export function couponLabel(coupon: Coupon, promotion: Promotion | undefined, now: number) {
  if (coupon.status === "redeemed") return "Canjeado"
  if (Date.parse(coupon.expires_at) <= now) return "Vencido"
  if (!promotion || !campaignIsActive(promotion, now)) return "No disponible"
  return "Disponible"
}

export function rewardDate(value: string) {
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }).format(new Date(value))
}

const invitationKey = "home_invitation"
export function pendingInvitation() {
  const fromUrl = new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase()
  try {
    if (fromUrl && /^INV-[A-F0-9]{12}$/.test(fromUrl)) {
      localStorage.setItem(invitationKey, fromUrl)
      return fromUrl
    }
    return localStorage.getItem(invitationKey) ?? ""
  } catch { return fromUrl ?? "" }
}

export function saveInvitation(code: string) {
  try {
    if (code.trim()) localStorage.setItem(invitationKey, code.trim().toUpperCase())
    else localStorage.removeItem(invitationKey)
  } catch { /* The invitation can also be entered directly in the account. */ }
}
