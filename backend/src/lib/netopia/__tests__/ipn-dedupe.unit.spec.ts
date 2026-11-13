import { isDuplicateIpn } from "../ipn-dedupe"

describe("isDuplicateIpn", () => {
  it("fără ntpID nu e niciodată repetare", () => {
    expect(isDuplicateIpn({ last_payment_id: "1" }, null, "error")).toBe(false)
  })

  it("tranzacție nouă nu e repetare", () => {
    expect(
      isDuplicateIpn({ last_payment_id: "1", last_payment_action: "error" }, "2", "canceled")
    ).toBe(false)
  })

  it("eșec retrimis pe aceeași tranzacție = repetare", () => {
    expect(
      isDuplicateIpn({ last_payment_id: "1", last_payment_action: "error" }, "1", "error")
    ).toBe(true)
  })

  it("succes după eșec în aceeași tranzacție trece (#419)", () => {
    expect(
      isDuplicateIpn({ last_payment_id: "1", last_payment_action: "error" }, "1", "confirmed")
    ).toBe(false)
  })

  it("succes după paid_pending (3DS) în aceeași tranzacție trece", () => {
    expect(
      isDuplicateIpn({ last_payment_id: "1", last_payment_action: "paid_pending" }, "1", "confirmed")
    ).toBe(false)
  })

  it("metadata veche, fără acțiune: confirmarea trece", () => {
    expect(isDuplicateIpn({ last_payment_id: "563596487" }, "563596487", "confirmed")).toBe(
      false
    )
  })

  it("confirmare retrimisă = repetare", () => {
    expect(
      isDuplicateIpn({ last_payment_id: "1", last_payment_action: "confirmed" }, "1", "confirmed")
    ).toBe(true)
  })

  it("expirare întârziată pe tranzacția eșuată rămâne blocată", () => {
    expect(
      isDuplicateIpn({ last_payment_id: "1", last_payment_action: "error" }, "1", "canceled")
    ).toBe(true)
  })
})
