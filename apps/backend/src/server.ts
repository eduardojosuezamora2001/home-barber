import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { fileURLToPath } from "node:url"
import { app } from "./app.js"
import { config } from "./config.js"
import { compress } from "hono/compress"
import { etag } from "hono/etag"

if (config.production) {
  const root = fileURLToPath(new URL("../../web/dist/", import.meta.url))
  const index = fileURLToPath(new URL("../../web/dist/index.html", import.meta.url))
  app.use("/*", compress({ encoding: "gzip", threshold: 1024, contentTypeFilter: /^(text\/|application\/(javascript|json)|image\/svg\+xml)/ }))
  app.use("/*", etag({ weak: true }))
  app.use("/*", serveStatic({ root, precompressed: true, onFound: (_path, c) => {
    c.header("Cache-Control", c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : c.req.path.startsWith("/images/") || c.req.path.startsWith("/fonts/") ? "public, max-age=86400, must-revalidate" : "no-cache")
  } }))
  app.get("*", serveStatic({ path: index, precompressed: true, onFound: (_path, c) => { c.header("Cache-Control", "no-cache") } }))
}

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.production ? "0.0.0.0" : "127.0.0.1" })
console.log(`HOME API lista en http://127.0.0.1:${config.port}`)
process.on("SIGINT", () => server.close())
process.on("SIGTERM", () => server.close())
