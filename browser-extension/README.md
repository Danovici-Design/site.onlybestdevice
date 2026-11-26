# Extensia „OBD – Import produs”

Citește pagina de produs a altui magazin **din browserul operatorului** și o
dă importului din admin (widgetul „Import de pe link” de pe pagina de produs).
Înlocuiește bookmarkletul și lipirea manuală a sursei.

De ce e nevoie de ea: eMAG răspunde 511/captcha cererilor din datacenter
(serverul de pe Dokploy), iar blocajul e pe IP. Browserul operatorului are un
IP acceptat. Detalii în `backend/src/lib/product-import/README.md`.

## Instalare (Chrome, Edge, Brave)

1. `chrome://extensions` → pornește **Developer mode** (dreapta sus).
2. **Load unpacked** → alege folderul `browser-extension` din repo.
3. Reîncarcă adminul (`https://api.onlybestdevice.ro/app`). Panoul de import
   arată acum butonul **Prin browser** și mesajul „Extensia OBD e activă”.

La o versiune nouă: `git pull`, apoi butonul ↻ de pe cardul extensiei din
`chrome://extensions`, apoi reîncarci adminul.

## Cum se folosește

- **Citește pagina**: încearcă întâi serverul. Dacă magazinul îl refuză,
  pagina se citește automat prin extensie.
- **Prin browser**: sare direct la extensie (util pentru site-urile care
  încarcă fișa sau galeria din JavaScript).

Extensia deschide linkul într-un tab nou în fundal, așteaptă să se încarce,
derulează pagina ca să încarce pozele „lazy”, copiază DOM-ul, închide tabul și
te întoarce în admin. Durează cam 5–10 s.

Dacă magazinul cere **captcha** sau întoarce o pagină aproape goală, tabul
devine vizibil și adminul îți spune să rezolvi verificarea. După ce o rezolvi,
pagina se citește singură. Ai la dispoziție 3 minute.

## Securitate

Extensia citește pagini cu sesiunea ta de browser, deci acceptă cereri **doar**
de la paginile de admin (`https://api.onlybestdevice.ro/app/*` și
`http://localhost/app/*` pentru dev). Verificarea e făcută de două ori: o dată
de `matches` din manifest, a doua oară în `background.js` (`isAdminUrl`). Dacă
adminul se mută pe alt domeniu, se schimbă în ambele locuri.

## Safari

Codul e o WebExtension standard (Manifest V3), deci se poate converti:

```bash
xcrun safari-web-extension-converter browser-extension --app-name "OBD Import"
```

Rezultatul e un proiect Xcode care trebuie compilat și semnat cu un cont Apple
Developer. Fără semnătură, Safari îl încarcă doar cu Develop → „Allow Unsigned
Extensions”, iar bifa se pierde la fiecare repornire. Până nu e nevoie reală,
folosiți Chrome.

## Fișiere

| Fișier            | Rol                                                                  |
| ----------------- | -------------------------------------------------------------------- |
| `manifest.json`   | permisiuni: `scripting` și `tabs` pe orice site (pentru tabul citit)  |
| `admin-bridge.js` | rulează în admin: marchează `<html data-obd-import-extension>` și duce mesajele |
| `background.js`   | deschide tabul, așteaptă, citește, detectează captcha, închide tabul   |

Partea din admin e `backend/src/admin/lib/browser-extension.ts`.
