import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const backend = fileURLToPath(new URL("../apps/backend/", import.meta.url))
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url))
const secretsFile = new URL("../apps/backend/.dev.vars", import.meta.url)
const args = [wrangler, "deploy", ...process.argv.slice(2)]

if (existsSync(secretsFile)) {
  if (readFileSync(secretsFile, "utf8").includes("REPLACE_WITH_SUPABASE_SERVER_SECRET")) {
    console.error("Completa SUPABASE_SECRET_KEY en apps/backend/.dev.vars antes de desplegar.")
    process.exit(1)
  }
  // Wrangler uploads this file as encrypted Worker secrets, not frontend variables.
  args.push("--secrets-file", fileURLToPath(secretsFile))
}

const result = spawnSync(process.execPath, args, { cwd: backend, stdio: "inherit", env: process.env })
if (result.error) {
  console.error(`No se pudo ejecutar Wrangler: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
