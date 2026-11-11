import assert from "node:assert/strict"
import test from "node:test"
import { ownerServiceReceipt, receiptCouponQuery } from "../src/validation.js"

const id = "00000000-0000-4000-8000-000000000001"
const receipt = { branchId: id, clientId: id, barberId: id, appointmentId: null, items: [{ serviceId: id, quantity: 1, unitPrice: 5000 }], note: "" }
test("receipts accept only a coupon code and reject client-supplied discounts", () => {
  assert.equal(ownerServiceReceipt.parse(receipt).couponCode, null)
  assert.equal(ownerServiceReceipt.parse({ ...receipt, couponCode: " home-abc1234567 " }).couponCode, "HOME-ABC1234567")
  for (const discountAmount of [0, -1, 0.001, 1000, Infinity, 120000001]) assert.equal(ownerServiceReceipt.safeParse({ ...receipt, couponCode: "HOME-ABC1234567", discountAmount }).success, false)
  assert.equal(ownerServiceReceipt.safeParse({ ...receipt, total: 0 }).success, false)
})
test("coupon lookup requires valid client, branch and discount code", () => {
  assert.equal(receiptCouponQuery.safeParse({ clientId: id, branchId: id }).success, true)
  for (const query of [{ branchId: id }, { clientId: id }, { clientId: id, branchId: id, code: "arbitrary" }]) assert.equal(receiptCouponQuery.safeParse(query).success, false)
})
