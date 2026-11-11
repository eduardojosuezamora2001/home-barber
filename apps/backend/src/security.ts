import { createHash } from "node:crypto"
import { isIP } from "node:net"
import { getConnInfo } from "@hono/node-server/conninfo"
import type { Context, MiddlewareHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import { secureHeaders } from "hono/secure-headers"
import { config } from "./config.js"

export const securityHeaders = secureHeaders({
  xFrameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
  strictTransportSecurity: config.production ? "max-age=31536000; includeSubDomains" : false,
  permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  ...(config.production ? { contentSecurityPolicy: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'"], fontSrc: ["'self'"], imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"],
    frameAncestors: ["'none'"], formAction: ["'self'"],
  } } : {}),
})

export const privateApiHeaders: MiddlewareHandler = async (c, next) => {
  c.header("Cache-Control", "private, no-store")
  c.header("Pragma", "no-cache")
  c.header("Vary", "Cookie")
  if (c.req.header("Sec-Fetch-Site") === "cross-site" && c.req.path !== "/api/public") {
    throw new HTTPException(403, { message: "Origen no permitido." })
  }
  await next()
}

export class WindowRateLimiter {
  private buckets = new Map<string, { count: number; until: number }>()
  constructor(private maxKeys = 5000) {}

  take(key: string, limit: number, windowMs: number, now = Date.now()) {
    let bucket = this.buckets.get(key)
    if (!bucket || bucket.until <= now) {
      if (this.buckets.size >= this.maxKeys) {
        for (const [stored, value] of this.buckets) if (value.until <= now) this.buckets.delete(stored)
        if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!)
      }
      bucket = { count: 0, until: now + windowMs }
      this.buckets.set(key, bucket)
    }
    bucket.count += 1
    return { allowed: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil((bucket.until - now) / 1000)) }
  }
}

function peerAddress(c: Context) {
  let peer = "local"
  try { peer = getConnInfo(c).remote.address ?? peer } catch { /* In-process requests have no socket. */ }
  if (!config.trustedProxyHops) return peer
  const chain = (c.req.header("X-Forwarded-For") ?? "").split(",").map((value) => value.trim()).filter((value) => isIP(value))
  chain.push(peer)
  return chain[Math.max(0, chain.length - config.trustedProxyHops - 1)] ?? peer
}

const authPeers = new WindowRateLimiter()
const authAccounts = new WindowRateLimiter()
const inquiryPeers = new WindowRateLimiter()
const inquiryPhones = new WindowRateLimiter()
const limitedPaths = new Set(["/api/auth/signin", "/api/auth/signup", "/api/auth/complete", "/api/auth/password/reset-request", "/api/auth/resend-confirmation"])

export const limitAuthentication: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== "POST" || !limitedPaths.has(c.req.path)) return next()
  const peer = peerAddress(c)
  const burst = authPeers.take(peer, 60, 60_000)
  const body: unknown = await c.req.json().catch(() => null)
  const email = body && typeof body === "object" && "email" in body && typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : ""
  const key = createHash("sha256").update(`${peer}|${c.req.path}|${email}`).digest("hex")
  const attempts = authAccounts.take(key, 10, 10 * 60_000)
  if (!burst.allowed || !attempts.allowed) {
    c.header("Retry-After", String(!burst.allowed ? burst.retryAfter : attempts.retryAfter))
    throw new HTTPException(429, { message: "Demasiados intentos. Espera unos minutos antes de volver a intentar." })
  }
  await next()
}

export const limitPublicInquiries: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== "POST" || c.req.path !== "/api/inquiries") return next()
  const peer = peerAddress(c)
  const burst = inquiryPeers.take(peer, 8, 60 * 60_000)
  const body: unknown = await c.req.json().catch(() => null)
  const phone = body && typeof body === "object" && "customerWhatsapp" in body && typeof body.customerWhatsapp === "string"
    ? body.customerWhatsapp.replace(/\D/g, "").slice(0, 15)
    : ""
  const phoneKey = createHash("sha256").update(`${peer}|${phone}`).digest("hex")
  const perPhone = inquiryPhones.take(phoneKey, 3, 60 * 60_000)
  if (!burst.allowed || !perPhone.allowed) {
    c.header("Retry-After", String(!burst.allowed ? burst.retryAfter : perPhone.retryAfter))
    throw new HTTPException(429, { message: "Has enviado varias consultas. Espera antes de intentarlo de nuevo." })
  }
  await next()
}
