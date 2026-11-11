// Keep the browser on the Pages origin so HttpOnly cookies and CSRF checks work.
export const onRequest: PagesFunction<PagesEnv> = async ({ request, env }) => {
  const headers = new Headers(request.headers)
  headers.delete("X-Home-Client-IP")
  headers.delete("X-Forwarded-For")
  const clientIp = request.headers.get("CF-Connecting-IP")
  if (clientIp) headers.set("X-Home-Client-IP", clientIp)

  try {
    return await env.API.fetch(new Request(request, { headers }))
  } catch (error) {
    console.error(JSON.stringify({ event: "api_proxy_failed", message: error instanceof Error ? error.message : "Unknown error" }))
    return Response.json({ error: "La API no está disponible. Intenta de nuevo en unos momentos." }, {
      status: 502, headers: { "Cache-Control": "private, no-store" },
    })
  }
}
