import { bankAccount, bankAccounts, hasBankAccount } from "../bank-account"

describe("bankAccount", () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("BANK_")) delete process.env[k]
    }
  })

  afterAll(() => {
    process.env = env
  })

  it("întoarce null fără IBAN, ca emailul de virament să nu plece gol", () => {
    expect(bankAccount()).toBeNull()
    expect(hasBankAccount()).toBe(false)
  })

  it("tratează IBAN-ul doar din spații ca lipsă", () => {
    process.env.BANK_IBAN = "   "
    expect(bankAccount()).toBeNull()
  })

  it("normalizează IBAN-ul scris cu spații, cum e pe extrasul de cont", () => {
    process.env.BANK_IBAN = " ro54 btrl ronpos 0584073801 "
    expect(bankAccount()?.iban).toBe("RO54BTRLRONPOS0584073801")
  })

  it("pune denumirea societății ca beneficiar implicit", () => {
    process.env.BANK_IBAN = "RO54BTRLRONPOS0584073801"
    expect(bankAccount()).toEqual({
      iban: "RO54BTRLRONPOS0584073801",
      name: "",
      holder: "ONLY BEST DEVICE S.R.L.",
    })
  })

  it("citește env-ul la fiecare apel, nu la import", () => {
    process.env.BANK_IBAN = "RO49AAAA1B31007593840000"
    expect(bankAccount()?.iban).toBe("RO49AAAA1B31007593840000")
    process.env.BANK_IBAN = "RO54BTRLRONPOS0584073801"
    expect(bankAccount()?.iban).toBe("RO54BTRLRONPOS0584073801")
  })
})

describe("bankAccounts", () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("BANK_")) delete process.env[k]
    }
  })

  afterAll(() => {
    process.env = env
  })

  it("citește toate conturile numerotate, în ordine", () => {
    process.env.BANK_IBAN = "RO92BTRLRONCRT0584073801"
    process.env.BANK_NAME = "Banca Transilvania"
    process.env.BANK_IBAN_2 = "RO15BRDE060SV53722470600"
    process.env.BANK_NAME_2 = "BRD"
    process.env.BANK_IBAN_3 = "RO19RZBR0000060031812947"
    process.env.BANK_NAME_3 = "Raiffeisen Bank"
    expect(bankAccounts().map((a) => a.name)).toEqual([
      "Banca Transilvania",
      "BRD",
      "Raiffeisen Bank",
    ])
    expect(bankAccounts().every((a) => a.holder === "ONLY BEST DEVICE S.R.L.")).toBe(true)
  })

  it("acceptă goluri în numerotare", () => {
    process.env.BANK_IBAN_3 = "RO19RZBR0000060031812947"
    expect(bankAccounts()).toHaveLength(1)
    expect(bankAccount()?.iban).toBe("RO19RZBR0000060031812947")
  })

  it("sare peste un IBAN tastat greșit, nu-l arată clientului", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    process.env.BANK_IBAN = "RO92BTRLRONCRT0584073802"
    process.env.BANK_IBAN_2 = "RO15BRDE060SV53722470600"
    expect(bankAccounts().map((a) => a.iban)).toEqual([
      "RO15BRDE060SV53722470600",
    ])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("nu dublează același cont", () => {
    process.env.BANK_IBAN = "RO19RZBR0000060031812947"
    process.env.BANK_IBAN_2 = "ro19 rzbr 0000 0600 3181 2947"
    expect(bankAccounts()).toHaveLength(1)
  })
})
