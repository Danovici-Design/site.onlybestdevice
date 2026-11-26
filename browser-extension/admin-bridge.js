/**
 * Puntea dintre adminul Medusa și extensie.
 *
 * Rulează doar pe paginile de admin (vezi `content_scripts` din manifest).
 * Pagina nu poate vorbi direct cu extensia fără să-i știe id-ul, deci vorbește
 * cu scriptul ăsta prin `window.postMessage`, iar el duce cererea mai departe
 * la `background.js` și aduce răspunsul înapoi.
 *
 * `data-obd-import-extension` pe `<html>` e semnalul de prezență: se pune la
 * `document_start`, înainte să pornească React-ul adminului, deci panoul de
 * import îl vede deja la prima randare.
 */
;(() => {
  if (!location.pathname.startsWith("/app")) return

  document.documentElement.dataset.obdImportExtension = chrome.runtime.getManifest().version

  const reply = (payload) =>
    window.postMessage({ source: "obd-extension", ...payload }, location.origin)

  window.addEventListener("message", (event) => {
    // Doar mesajele paginii însăși — nu ale unui iframe sau ale altui tab.
    if (event.source !== window || event.origin !== location.origin) return
    const msg = event.data
    if (!msg || msg.source !== "obd-admin" || msg.type !== "capture") return

    chrome.runtime.sendMessage({ type: "obd-capture", id: msg.id, url: msg.url, render: !!msg.render }, (res) => {
      const err = chrome.runtime.lastError
      reply({
        type: "capture-result",
        id: msg.id,
        ...(err || !res ? { ok: false, error: err?.message || "Extensia n-a răspuns." } : res),
      })
    })
  })

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "obd-progress") reply({ type: "progress", id: msg.id, stage: msg.stage })
  })
})()
