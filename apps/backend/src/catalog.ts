import type { SupabaseClient } from "@supabase/supabase-js"
import { unwrap } from "./db.js"
import { database } from "./db.js"
import { createPublicCache } from "./cache.js"
import { config } from "./config.js"

type Catalog = Record<"branches" | "branchHours" | "services" | "barbers" | "barberBranches" | "barberHours" | "barberBlocks", unknown[]>

// Workers can reuse settled public values, but not I/O promises from another request.
const cache = createPublicCache<Catalog>(15_000, { deduplicate: !config.cloudflare })
const publicDb = database()

async function queryCatalog(db: SupabaseClient, publicOnly = false): Promise<Catalog> {
  const blocks = db.from("barber_blocks").select("id,barber_id,branch_id,starts_at,ends_at").gte("ends_at", new Date().toISOString())
  if (publicOnly) blocks.lt("starts_at", new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString())
  const [branches, branchHours, services, barbers, barberBranches, barberHours, barberBlocks] = await Promise.all([
    db.from("branches").select("id,slug,name,location_label,address,whatsapp,timezone,active").order("name"),
    db.from("branch_hours").select("id,branch_id,weekday,opens_at,closes_at,closed").order("weekday"),
    db.from("services").select("id,name,description,duration_minutes,price,points,active,sort_order").order("sort_order"),
    db.from("barbers").select(publicOnly ? "id,display_name,specialty,bio,is_demo,active" : "*").order("display_name"),
    db.from("barber_branches").select("*"),
    db.from("barber_hours").select("*"),
    blocks,
  ])
  const result = {
    branches: unwrap<unknown[]>(branches),
    branchHours: unwrap<unknown[]>(branchHours),
    services: unwrap<unknown[]>(services),
    barbers: unwrap<unknown[]>(barbers),
    barberBranches: unwrap<unknown[]>(barberBranches),
    barberHours: unwrap<unknown[]>(barberHours),
    barberBlocks: unwrap<unknown[]>(barberBlocks),
  }
  if (!publicOnly) return result
  type Row = Record<string, unknown>
  const activeBranches = (result.branches as Row[]).filter((branch) => branch.active)
  const activeBarbers = (result.barbers as Row[]).filter((barber) => barber.active)
  const branchIds = new Set(activeBranches.map((branch) => branch.id))
  const barberIds = new Set(activeBarbers.map((barber) => barber.id))
  const inBranch = (item: unknown) => branchIds.has((item as Row).branch_id)
  const inCatalog = (item: unknown) => inBranch(item) && barberIds.has((item as Row).barber_id)
  return {
    branches: activeBranches,
    barbers: activeBarbers.map((barber) => ({ ...barber, user_id: null })),
    services: (result.services as Row[]).filter((service) => service.active),
    branchHours: result.branchHours.filter(inBranch),
    barberBranches: result.barberBranches.filter(inCatalog),
    barberHours: result.barberHours.filter(inCatalog),
    barberBlocks: result.barberBlocks.filter(inCatalog),
  }
}

export function publicCatalog() {
  return cache.get(() => queryCatalog(publicDb, true))
}

export function ownerCatalog(db: SupabaseClient) {
  return queryCatalog(db)
}

export function invalidateCatalog() {
  cache.invalidate()
}
