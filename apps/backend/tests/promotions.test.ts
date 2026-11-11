import assert from "node:assert/strict"
import test from "node:test"
import { promotionPatch } from "../src/validation.js"

const campaign = { title: "Beneficio de prueba", description: "Condiciones", benefitText: "Descuento de prueba", branchId: null, kind: "frequency", visitsEvery: 5, rewardValidDays: 30, referralBenefitText: null, discountType: "percentage", discountValue: 10, startsAt: "2026-11-01T06:00:00.000Z", endsAt: "2026-12-01T05:59:00.000Z" }

test("campaign editing accepts complete details and independent activation", () => {
  assert.equal(promotionPatch.safeParse(campaign).success, true)
  assert.deepEqual(promotionPatch.parse({ active: false }), { active: false })
  assert.equal(promotionPatch.safeParse({ ...campaign, kind: "legacy", visitsEvery: null }).success, true)
})

test("campaign editing rejects invalid periods and missing reward conditions", () => {
  for (const changes of [{ endsAt: campaign.startsAt }, { title: "x" }, { visitsEvery: null }, { rewardValidDays: 0 }, { kind: "referral", referralBenefitText: null }]) assert.equal(promotionPatch.safeParse({ ...campaign, ...changes }).success, false)
})

test("campaign editing rejects partial, mixed and protected fields", () => {
  for (const value of [{ title: "Incomplete" }, { ...campaign, active: true }, { ...campaign, created_by: "other" }, { active: true, kind: "welcome" }]) assert.equal(promotionPatch.safeParse(value).success, false)
})

test("discounts require positive amounts, valid percentages and both referral values", () => {
  for (const changes of [{ discountValue: 0 }, { discountValue: -1 }, { discountValue: 100.01 }, { discountValue: 0.001 }, { discountType: "manual" }, { kind: "referral", referralBenefitText: "Para quien invita" }]) assert.equal(promotionPatch.safeParse({ ...campaign, ...changes }).success, false)
  assert.equal(promotionPatch.safeParse({ ...campaign, discountType: "fixed", discountValue: 1000 }).success, true)
  assert.equal(promotionPatch.safeParse({ ...campaign, kind: "referral", referralBenefitText: "Para quien invita", referralDiscountType: "fixed", referralDiscountValue: 1000 }).success, true)
  assert.equal(promotionPatch.safeParse({ ...campaign, kind: "referral", referralBenefitText: "Para quien invita", referralDiscountType: "percentage", referralDiscountValue: 101 }).success, false)
})
