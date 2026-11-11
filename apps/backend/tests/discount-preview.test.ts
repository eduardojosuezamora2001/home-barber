import assert from "node:assert/strict"
import test from "node:test"
import { calculateDiscount } from "../../web/src/lib/discounts.ts"

test("checkout previews percentages, fixed amounts, rounding and caps", () => {
  assert.equal(calculateDiscount(5000, { discount_type: "percentage", discount_value: 10 }), 500)
  assert.equal(calculateDiscount(5000, { discount_type: "fixed", discount_value: 1000 }), 1000)
  assert.equal(calculateDiscount(123.45, { discount_type: "percentage", discount_value: 10 }), 12.35)
  assert.equal(calculateDiscount(300, { discount_type: "fixed", discount_value: 1000 }), 300)
  assert.equal(calculateDiscount(5000, { discount_type: "percentage", discount_value: 100 }), 5000)
  assert.equal(calculateDiscount(0, { discount_type: "fixed", discount_value: 1000 }), 0)
  assert.equal(calculateDiscount(5000, { discount_type: "none", discount_value: 0 }), 0)
  assert.equal(calculateDiscount(5000, null), 0)
})
