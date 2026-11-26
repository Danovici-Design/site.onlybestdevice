/**
 * Legătura cu extensia „OBD – Import produs" (`/browser-extension` din repo).
 *
 * Extensia deschide pagina magazinului într-un tab al operatorului, citește
 * DOM-ul viu și îl întoarce aici — adică face singură ce făcea bookmarkletul
 * plus lipirea manuală. Merge pe eMAG pentru că cererea pleacă de pe IP-ul
 * operatorului, nu din datacenter (vezi `lib/product-import/README.md`).
 *
 * Comunicarea e prin `window.postMessage` cu scriptul de conținut al extensiei
 * (`admin-bridge.js`), care marchează `<html data-obd-import-extension="…">`
 * când e instalată.
 */

export type CaptureStage = "loading" | "reading" | "captcha"

export type CapturedPage = { html: string; url: string; title?: string }

/** Versiunea extensiei, sau `null` dacă nu e instalată (sau adminul n-a fost reîncărcat). */
export const extensionVersion = (): string | null =>
  typeof document === "undefined"
    ? null
    : document.documentElement.dataset.obdImportExtension ?? null

/** Captcha-ul poate dura; peste atât renunțăm (extensia are propriul plafon de 3 minute). */
const TIMEOUT_MS = 5 * 60_000

export function captureViaExtension(
  url: string,
  onProgress?: (stage: CaptureStage) => void
): Promise<CapturedPage> {
  if (!extensionVersion()) {
    return Promise.reject(new Error("Extensia OBD nu e instalată."))
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("message", onMessage)
      window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error("Extensia n-a răspuns la timp."))
    }, TIMEOUT_MS)

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return
      const msg = event.data
      if (!msg || msg.source !== "obd-extension" || msg.id !== id) return

      if (msg.type === "progress") {
        onProgress?.(msg.stage)
        return
      }
      if (msg.type !== "capture-result") return

      cleanup()
      if (msg.ok && typeof msg.html === "string") {
        resolve({ html: msg.html, url: msg.url || url, title: msg.title })
      } else {
        reject(new Error(msg.error || "Citirea prin extensie a eșuat."))
      }
    }

    window.addEventListener("message", onMessage)
    window.postMessage({ source: "obd-admin", type: "capture", id, url }, window.location.origin)
  })
}
