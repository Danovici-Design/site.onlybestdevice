import { withComputedStatuses } from "../computed-status"

const pc = (status: string, amount: number, captured = 0, refunded = 0) => ({
  status,
  amount,
  captured_amount: captured,
  refunded_amount: refunded,
})

describe("withComputedStatuses", () => {
  it("calculează plata și livrarea ca Medusa", () => {
    const o = withComputedStatuses({
      id: "o",
      currency_code: "ron",
      payment_collections: [pc("completed", 6237, 6237)],
      fulfillments: [{ shipped_at: "2026-11-13T00:00:00Z" }],
    })!
    expect(o.payment_status).toBe("captured")
    expect(o.fulfillment_status).toBe("shipped")
  })

  it("autorizat, fără livrare", () => {
    const o = withComputedStatuses({
      id: "o",
      currency_code: "ron",
      payment_collections: [pc("authorized", 3337)],
    })!
    expect(o.payment_status).toBe("authorized")
    expect(o.fulfillment_status).toBe("not_fulfilled")
  })

  it("refund integral", () => {
    const o = withComputedStatuses({
      id: "o",
      currency_code: "ron",
      payment_collections: [pc("completed", 100, 100, 100)],
    })!
    expect(o.payment_status).toBe("refunded")
  })

  it("nu suprascrie valori deja calculate de Medusa", () => {
    const o = withComputedStatuses({
      id: "o",
      payment_status: "captured",
      fulfillment_status: "delivered",
    })!
    expect(o.payment_status).toBe("captured")
    expect(o.fulfillment_status).toBe("delivered")
  })

  it("comanda lipsă rămâne null", () => {
    expect(withComputedStatuses(undefined)).toBeNull()
  })
})
