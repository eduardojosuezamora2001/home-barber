import type { Context } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import type { Session } from "@supabase/supabase-js"
import { authClient, database } from "./db.js"
import { config } from "./config.js"

const accessName = "home_access"
const refreshName = "home_refresh"
const claimsVerifier = authClient()

export type Role = "owner" | "barber" | "manager" | "client"
interface SessionContext { user_id: string; email: string | null; role: Role; branch_id: string | null }
interface VerifiedSession {
  userId: string; email: string | null; role: Role; branchId: string | null
  accessToken: string; refreshToken: string | undefined; db: ReturnType<typeof database>
}

function cookieOptions(maxAge: number) {
  return { path: "/", httpOnly: true, secure: config.production, sameSite: "Lax" as const, maxAge }
}

export function saveSession(c: Context, session: Session) {
  setCookie(c, accessName, session.access_token, cookieOptions(Math.max(1, session.expires_in - 30)))
  setCookie(c, refreshName, session.refresh_token, cookieOptions(60 * 60 * 24 * 30))
}

export function clearSession(c: Context) {
  deleteCookie(c, accessName, { path: "/" })
  deleteCookie(c, refreshName, { path: "/" })
}

export async function sessionFor(c: Context) {
  const existing = c.get("verifiedSession") as VerifiedSession | undefined
  if (existing) return existing
  let accessToken = getCookie(c, accessName)
  let refreshToken = getCookie(c, refreshName)
  if (!accessToken && !refreshToken) throw new HTTPException(401, { message: "Inicia sesión para continuar." })
  let claims = accessToken ? await claimsVerifier.auth.getClaims(accessToken) : null
  if (!claims?.data?.claims?.sub || claims.error) {
    if (!refreshToken) {
      clearSession(c)
      throw new HTTPException(401, { message: "Tu sesión venció. Vuelve a entrar." })
    }
    const refreshed = await authClient().auth.refreshSession({ refresh_token: refreshToken })
    if (refreshed.error || !refreshed.data.session) {
      clearSession(c)
      throw new HTTPException(401, { message: "Tu sesión venció. Vuelve a entrar." })
    }
    saveSession(c, refreshed.data.session)
    accessToken = refreshed.data.session.access_token
    refreshToken = refreshed.data.session.refresh_token
    claims = await claimsVerifier.auth.getClaims(accessToken)
  }
  if (!accessToken || !claims.data?.claims?.sub || claims.error) throw new HTTPException(401, { message: "Sesión inválida." })
  const db = database(accessToken)
  const context = await db.rpc("current_session_context")
  if (context.error) throw new HTTPException(502, { message: "No se pudo verificar tu sesión. Intenta de nuevo." })
  const identity = (context.data as SessionContext[] | null)?.[0]
  if (!identity || identity.user_id !== String(claims.data.claims.sub)) {
    clearSession(c)
    throw new HTTPException(401, { message: "Tu sesión ya no está activa. Vuelve a entrar." })
  }
  const verified: VerifiedSession = {
    userId: identity.user_id,
    email: identity.email,
    role: identity.role,
    branchId: identity.branch_id,
    accessToken,
    refreshToken,
    db,
  }
  c.set("verifiedSession", verified)
  return verified
}

export async function requireRole(c: Context, role: Role) {
  const session = await sessionFor(c)
  if (session.role !== role) throw new HTTPException(403, { message: "No tienes permiso para esta operación." })
  return session
}

export function readCookies(c: Context) {
  return { accessToken: getCookie(c, accessName), refreshToken: getCookie(c, refreshName) }
}
