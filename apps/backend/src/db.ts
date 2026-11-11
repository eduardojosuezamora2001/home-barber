import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { HTTPException } from "hono/http-exception"
import { config } from "./config.js"

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }

export function authClient() {
  return createClient(config.supabaseUrl, config.publishableKey, { auth: authOptions })
}

export function database(accessToken?: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: authOptions,
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  })
}

export function unwrap<T>(result: { data: unknown; error: { message: string } | null }, status: 400 | 502 = 502): T {
  if (result.error) throw new HTTPException(status, { message: result.error.message })
  return result.data as T
}
