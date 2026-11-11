import assert from "node:assert/strict"
import { test } from "node:test"
import { campaignCreate, contactCreate, contactImport, listQuery, serviceIntervalPatch } from "../src/crm-validation.js"

const branchId = "11111111-1111-4111-8111-111111111111"

test("el encargado puede crear un contacto sin enviar una sede ajena", () => {
  const input = contactCreate.parse({ fullName: "María Pérez", phone: "+506 8888-1111", source: "manual" })
  assert.equal(input.branchId, undefined)
  assert.equal(input.phone, "50688881111")
  assert.equal(contactCreate.safeParse({ fullName: "María", phone: "88881111", source: "unknown" }).success, false)
})

test("la importación exige evidencia al marcar consentimiento comercial", () => {
  const row = { fullName: "María Pérez", phone: "88881111", branchId, source: "csv" }
  assert.equal(contactImport.safeParse({ rows: [{ ...row, consent: { status: "granted", source: "csv" } }] }).success, false)
  assert.equal(contactImport.parse({ rows: [row] }).dryRun, true)
})

test("los límites de los servicios y mensajes coinciden con la base", () => {
  assert.equal(serviceIntervalPatch.safeParse({ returnDays: 6 }).success, false)
  assert.equal(serviceIntervalPatch.safeParse({ returnDays: 180 }).success, true)
  assert.equal(campaignCreate.safeParse({ branchId, name: "Retorno", goal: "10 reservas", messageTemplate: "x".repeat(1501) }).success, false)
  assert.equal(listQuery.parse({}).includeDemo, false)
})
