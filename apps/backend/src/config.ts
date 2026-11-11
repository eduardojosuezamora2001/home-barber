export const config = {
  port: Number(process.env.PORT ?? 8787),
  supabaseUrl: process.env.SUPABASE_URL ?? "https://azebvkknyursakzaldkl.supabase.co",
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_x2lSNYHjCHv_dnom2OnZGA_IAPnwBtL",
  // Server-only. Required for public CRM intake; never send this key to the web bundle.
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? null,
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  production: process.env.NODE_ENV === "production",
  trustedProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
}

if (!Number.isInteger(config.trustedProxyHops) || config.trustedProxyHops < 0 || config.trustedProxyHops > 5) {
  throw new Error("TRUST_PROXY_HOPS debe ser un entero entre 0 y 5.")
}

export const allowedOrigins = new Set([
  config.webOrigin,
  ...(config.production ? [] : ["http://127.0.0.1:3000", "http://localhost:3000"]),
])
