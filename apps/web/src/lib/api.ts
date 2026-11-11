export async function apiRequest<T>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown, options?: { cache?: RequestCache }): Promise<T> {
  const publicRequest = method === "GET" && path === "/public"
  const response = await fetch(`/api${path}`, {
    method,
    credentials: publicRequest ? "omit" : "same-origin",
    cache: publicRequest ? options?.cache ?? "default" : "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json().catch(() => null) as { error?: string } | null
  if (!response.ok) throw new Error(result?.error ?? `La solicitud falló (${response.status}).`)
  return result as T
}

export const api = {
  get: <T>(path: string, options?: { cache?: RequestCache }) => apiRequest<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown) => apiRequest<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => apiRequest<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => apiRequest<T>("PUT", path, body),
  delete: <T>(path: string) => apiRequest<T>("DELETE", path),
}
