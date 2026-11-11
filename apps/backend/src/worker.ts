import { app } from "./app.js"

// Workers uses Hono's Fetch handler; the Node HTTP server stays in server.ts.
export default { fetch: app.fetch }
