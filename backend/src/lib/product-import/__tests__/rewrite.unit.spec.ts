/**
 * Verificările puse peste rescrierea pentru SEO. Fără apel la API.
 *
 * Rescrierea compune text nou, deci nu se mai poate cere „propoziția există în
 * pagină". Ce rămâne verificabil sunt faptele: cifrele și pozele.
 */
import { groundKey } from "../ai"
import { copiedShare, restoreImages, tokenizeImages, ungroundedNumbers } from "../rewrite"

describe("tokenizeImages / restoreImages", () => {
  const html =
    '<p>Ecran</p><img src="https://cdn.emag.ro/a.jpg" alt="a"><p>Cameră</p><img data-src="https://cdn.emag.ro/b.jpg">'

  it("modelul vede doar jetoane, nu URL-uri", () => {
    const { html: out, images } = tokenizeImages(html)
    expect(out).not.toContain("cdn.emag.ro")
    expect(out).toContain('<img src="IMG_1">')
    expect(out).toContain('<img src="IMG_2">')
    expect(images.size).toBe(2)
  })

  it("pune la loc tagul original, chiar dacă modelul a mutat poza", () => {
    const { images } = tokenizeImages(html)
    const { html: out, dropped } = restoreImages('<h2>Cameră</h2><img src="IMG_2"><p>x</p>', images)
    expect(out).toContain('data-src="https://cdn.emag.ro/b.jpg"')
    expect(out).not.toContain("a.jpg")
    expect(dropped).toBe(0)
  })

  it("aruncă jetoanele inventate, URL-urile scrise de model și duplicatele", () => {
    const { images } = tokenizeImages(html)
    const { html: out, dropped } = restoreImages(
      '<img src="IMG_9"><img src="https://exemplu.ro/x.jpg"><img src="IMG_1"><img src="IMG_1">',
      images
    )
    expect(out).toBe('<img src="https://cdn.emag.ro/a.jpg" alt="a">')
    expect(dropped).toBe(3)
  })
})

describe("ungroundedNumbers", () => {
  const source = groundKey(
    "Ecran OLED de 6,1 inchi, cip A14 Bionic. Memorie 128GB. Ceramic Shield de 4x mai rezistent."
  )

  it("acceptă cifrele din sursă, indiferent de virgulă sau punct", () => {
    expect(ungroundedNumbers("Ecranul are 6.1 inchi, iar memoria 128 GB.", source)).toEqual([])
  })

  it("prinde o valoare inventată", () => {
    expect(ungroundedNumbers("Bateria are 5000 mAh și ecranul 6,1 inchi.", source)).toEqual(["5000"])
  })

  it("nu lasă „12” să treacă doar pentru că sursa conține „128”", () => {
    expect(ungroundedNumbers("Cameră de 12 MP.", source)).toEqual(["12"])
  })

  it("cifre din cuvinte lipite („A14”, „128GB”) se regăsesc", () => {
    expect(ungroundedNumbers("Cipul A14 și 128GB.", source)).toEqual([])
  })
})

describe("copiedShare", () => {
  const sourceText =
    "Iti prezentam Ceramic Shield, fabricata prin introducerea cristalelor nano-ceramice in sticla. " +
    "Un ecran OLED care se intinde de la o margine la alta a telefonului."
  const source = groundKey(sourceText)

  it("textul copiat iese 100%", () => {
    expect(copiedShare(sourceText, source)).toBe(1)
  })

  it("textul reformulat iese 0", () => {
    expect(
      copiedShare(
        "Sticla din față folosește Ceramic Shield, cu cristale nano-ceramice integrate. Ecranul OLED acoperă toată fața.",
        source
      )
    ).toBe(0)
  })
})
