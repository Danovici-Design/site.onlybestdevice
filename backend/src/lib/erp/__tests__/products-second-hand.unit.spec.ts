import { secondHandMetadata, upsertProducts } from "../products"

/**
 * Aparatele second hand venite din gestiune (cate unul pe IMEI): produsul se
 * creeaza cu tagul `second-hand` si cu datele cardului din admin deja puse.
 */

const createRun = jest.fn()
const listProductTags = jest.fn()
const createProductTags = jest.fn()

jest.mock("../../pricing", () => ({
  readProductPrices: jest.fn(),
  writeProductPrices: jest.fn(),
}))

jest.mock("../../currency", () => ({
  resolveCurrencyCode: async () => "ron",
}))

jest.mock("../stock", () => ({
  applyStock: jest.fn(async () => ({ errors: [] })),
}))

jest.mock("@medusajs/medusa/core-flows", () => ({
  createProductsWorkflow: () => ({ run: (...args: unknown[]) => createRun(...args) }),
  updateProductsWorkflow: () => ({ run: jest.fn(async () => ({})) }),
}))

const services: Record<string, unknown> = {
  query: { graph: async () => ({ data: [] }) },
  sales_channel: { listSalesChannels: async () => [{ id: "sc_1", name: "Default Sales Channel" }] },
  fulfillment: { listShippingProfiles: async () => [{ id: "sp_1" }] },
  product: {
    listProductTags: (...a: unknown[]) => listProductTags(...a),
    createProductTags: (...a: unknown[]) => createProductTags(...a),
  },
}

const container = { resolve: (key: string) => services[key] }

const createdInput = () => createRun.mock.calls[0][0].input.products[0]

beforeEach(() => {
  jest.clearAllMocks()
  createRun.mockResolvedValue({
    result: [{ id: "prod_sh", handle: "iphone-13", variants: [{ id: "variant_sh" }] }],
  })
  listProductTags.mockResolvedValue([{ id: "ptag_sh", value: "second-hand" }])
})

describe("secondHandMetadata", () => {
  it("scrie cheile cardului din admin", () => {
    expect(
      secondHandMetadata({ grade: "excelent", battery_health: 87.4, warranty_months: 12, notes: " zgarietura rama " })
    ).toEqual({
      sh_grade: "excelent",
      sh_battery_health: 87,
      sh_warranty_months: 12,
      sh_notes: "zgarietura rama",
    })
  })

  it("sare valorile pe care cardul nu le-ar accepta", () => {
    expect(
      secondHandMetadata({ grade: "folosit", battery_health: 140, warranty_months: 0, notes: "" })
    ).toEqual({})
  })

  it("fara second_hand nu e produs second hand", () => {
    expect(secondHandMetadata(null)).toBeNull()
    expect(secondHandMetadata(undefined)).toBeNull()
  })
})

describe("upsertProducts — second hand", () => {
  it("creeaza produsul cu tagul second-hand si datele in metadata", async () => {
    const result = await upsertProducts(container, [
      {
        sku: "IPH13-128-SH-42",
        title: "iPhone 13 128GB Albastru (Second Hand)",
        price: 1899,
        quantity: 1,
        specs: { Stare: "Second hand" },
        second_hand: { grade: "foarte-bun", battery_health: 86, warranty_months: 12 },
      },
    ])

    expect(result.errors).toEqual([])
    expect(result.created).toBe(1)

    const input = createdInput()
    expect(input.status).toBe("draft")
    expect(input.tag_ids).toEqual(["ptag_sh"])
    expect(input.metadata).toEqual({
      specs: { Stare: "Second hand" },
      sh_grade: "foarte-bun",
      sh_battery_health: 86,
      sh_warranty_months: 12,
    })
    expect(createProductTags).not.toHaveBeenCalled()
  })

  it("creeaza tagul daca nu exista inca", async () => {
    listProductTags.mockResolvedValue([])
    createProductTags.mockResolvedValue([{ id: "ptag_new", value: "second-hand" }])

    await upsertProducts(container, [
      { sku: "SH-1", title: "Galaxy S22 (Second Hand)", second_hand: {} },
    ])

    expect(createProductTags).toHaveBeenCalledWith([{ value: "second-hand" }])
    expect(createdInput().tag_ids).toEqual(["ptag_new"])
  })

  it("un produs nou obisnuit nu primeste tag", async () => {
    await upsertProducts(container, [{ sku: "IPH15", title: "iPhone 15" }])

    expect(createdInput().tag_ids).toBeUndefined()
    expect(createdInput().metadata).toBeUndefined()
    expect(listProductTags).not.toHaveBeenCalled()
  })
})
