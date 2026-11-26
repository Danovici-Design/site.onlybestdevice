/**
 * Citește o pagină de produs din browserul operatorului.
 *
 * De ce: eMAG (și alte magazine) răspund 511 / captcha cererilor venite din
 * datacenter, iar blocajul e pe IP. Browserul operatorului are un IP acceptat,
 * deci pagina se deschide aici, într-un tab nou, se citește DOM-ul viu (cu
 * galeria montată de JavaScript) și se trimite înapoi adminului, care îl dă
 * rutei `/admin/product-import/preview` exact ca pe o sursă lipită.
 *
 * Cine poate cere o citire: doar `admin-bridge.js`, adică paginile de admin
 * din `ADMIN_ORIGINS`. Extensia deschide pagini cu sesiunea operatorului, deci
 * nu acceptă cereri de nicăieri altundeva.
 */

/** Adminurile care au voie să ceară citiri. `localhost` = orice port (dev). */
const isAdminUrl = (raw) => {
  try {
    const u = new URL(raw)
    const allowed =
      u.origin === "https://api.onlybestdevice.ro" ||
      (u.protocol === "http:" && u.hostname === "localhost")
    return allowed && u.pathname.startsWith("/app")
  } catch {
    return false
  }
}

/** Cât așteptăm încărcarea paginii înainte să citim oricum ce s-a randat. */
const LOAD_TIMEOUT_MS = 45_000
/** Cât îi dăm operatorului să rezolve un captcha. */
const CAPTCHA_TIMEOUT_MS = 180_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "obd-capture") return
  if (sender.id !== chrome.runtime.id || !sender.tab || !isAdminUrl(sender.url)) {
    sendResponse({ ok: false, error: "Cerere refuzată: nu vine din adminul Onlybestdevice." })
    return
  }
  capture(msg.url, sender.tab, msg.id).then(sendResponse, (err) =>
    sendResponse({ ok: false, error: err?.message || String(err) })
  )
  return true // răspunsul vine asincron
})

/** Rezolvă când tabul termină de încărcat; la expirare rezolvă `false`, nu aruncă. */
function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (fn, value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.tabs.onRemoved.removeListener(onRemoved)
      fn(value)
    }
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") finish(resolve, true)
    }
    const onRemoved = (id) => {
      if (id === tabId) finish(reject, new Error("Tabul magazinului a fost închis înainte de citire."))
    }
    const timer = setTimeout(() => finish(resolve, false), timeoutMs)
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.onRemoved.addListener(onRemoved)
    chrome.tabs.get(tabId).then(
      (tab) => tab.status === "complete" && finish(resolve, true),
      () => finish(reject, new Error("Tabul magazinului a dispărut."))
    )
  })
}

/**
 * Plafonul unei citiri. `capturePage` ia cel mult ~15 s (așteptarea DOM-ului
 * plus derularea); peste, pagina a navigat între timp — de pildă operatorul a
 * rezolvat captcha-ul exact în timpul citirii —, iar Chrome lasă promisiunea
 * lui `executeScript` atârnată, fără să o respingă.
 */
const READ_TIMEOUT_MS = 30_000

async function readTab(tabId) {
  let results
  let timer
  try {
    results = await Promise.race([
      chrome.scripting.executeScript({ target: { tabId }, func: capturePage }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("pagina s-a schimbat în timpul citirii")), READ_TIMEOUT_MS)
      }),
    ])
  } catch (err) {
    throw new Error(`Pagina nu poate fi citită de extensie: ${err?.message || err}`)
  } finally {
    clearTimeout(timer)
  }
  const result = results?.[0]?.result
  if (!result?.html) throw new Error("Pagina nu a întors conținut.")
  return result
}

async function capture(rawUrl, adminTab, id) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error("Linkul nu e un URL valid.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Doar linkuri http(s).")
  }

  const progress = (stage) =>
    chrome.tabs.sendMessage(adminTab.id, { type: "obd-progress", id, stage }).catch(() => {})

  const tab = await chrome.tabs.create({
    url: url.href,
    active: false,
    windowId: adminTab.windowId,
    index: adminTab.index + 1,
    openerTabId: adminTab.id,
  })

  // Service workerul MV3 se oprește după ~30 s fără activitate; un apel de API
  // la 20 s îl ține treaz cât timp așteptăm pagina sau captcha-ul.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000)

  try {
    progress("loading")
    await waitForLoad(tab.id, LOAD_TIMEOUT_MS)
    progress("reading")
    let page = await readTab(tab.id)

    if (page.blocked) {
      // Captcha / verificare: tabul devine vizibil, operatorul o rezolvă, iar
      // noi reîncercăm până dispare. Fără navigare obligatorie — unele
      // verificări se rezolvă în aceeași pagină.
      progress("captcha")
      await chrome.tabs.update(tab.id, { active: true })
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {})

      const deadline = Date.now() + CAPTCHA_TIMEOUT_MS
      while (page.blocked && Date.now() < deadline) {
        await sleep(2500)
        const current = await chrome.tabs.get(tab.id).catch(() => null)
        if (!current) throw new Error("Tabul magazinului a fost închis înainte de citire.")
        if (current.status !== "complete") continue
        page = await readTab(tab.id).catch(() => page)
      }
      if (page.blocked) {
        throw new Error("Pagina a rămas la verificare (captcha). Rezolv-o și încearcă din nou.")
      }
      progress("reading")
    }

    return { ok: true, html: page.html, url: page.url, title: page.title }
  } finally {
    clearInterval(keepAlive)
    await chrome.tabs.remove(tab.id).catch(() => {})
    await chrome.tabs.update(adminTab.id, { active: true }).catch(() => {})
  }
}

/**
 * Rulează ÎN pagina magazinului (`chrome.scripting.executeScript`), deci
 * trebuie să fie autonomă: fără referințe la nimic din fișierul ăsta.
 *
 * Aceeași curățenie ca bookmarkletul (`backend/src/admin/lib/page-source-bookmarklet.ts`):
 * scoate scripturile executabile, stilurile, SVG-urile și iframe-urile, dar
 * PĂSTREAZĂ `<script>`-urile json/template — acolo stau JSON-LD-ul și fișele
 * duplicate din care citesc adaptoarele.
 */
async function capturePage() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // 1. Așteptăm să se liniștească DOM-ul (galerii și fișe montate din JS).
  let last = -1
  let stable = 0
  for (let i = 0; i < 20 && stable < 2; i++) {
    const size = document.documentElement.innerHTML.length
    stable = size === last ? stable + 1 : 0
    last = size
    await sleep(400)
  }

  // 2. Derulăm pagina, ca pozele „lazy" să-și primească `src`-ul.
  const step = window.innerHeight || 800
  const height = Math.min(document.documentElement.scrollHeight, 30000)
  for (let y = 0; y < height; y += step) {
    window.scrollTo(0, y)
    await sleep(150)
  }
  window.scrollTo(0, 0)
  await sleep(400)

  // 3. E o pagină de verificare în loc de produs? Două semne: textul tipic de
  //    captcha, sau o pagină aproape goală — eMAG răspunde unui browser
  //    suspect cu un „410 Gone" de 400 de octeți, fără niciun cuvânt de
  //    captcha. În ambele cazuri tabul îi e arătat operatorului.
  const text = (document.body?.innerText || "").replace(/\s+/g, " ").trim()
  const blocked =
    text.length < 300 ||
    (text.length < 8000 &&
      /captcha|verify you are human|are you a robot|nu sunte(t|ț)i robot|access denied|just a moment|attention required|security check|verificare de securitate/i.test(
        `${document.title} ${text.slice(0, 4000)}`
      ))

  // 4. Copia curățată a DOM-ului viu.
  const clone = document.documentElement.cloneNode(true)
  for (const node of clone.querySelectorAll("script")) {
    if (!/json|template/i.test(node.getAttribute("type") || "")) node.remove()
  }
  for (const node of clone.querySelectorAll("style,link,svg,noscript,iframe")) node.remove()

  return {
    blocked,
    html: `<!doctype html>${clone.outerHTML}`,
    url: location.href,
    title: document.title,
  }
}
