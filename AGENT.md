# PDF Read Helper

This document is the single source of truth for product scope, architecture, constraints, and project status. Read it before changing code and update it before ending a development session.

## 1. Mission

PDF Read Helper reduces the repeated friction involved in handing pages from papers and technical books to an LLM:

`PDF reading → page capture/page extraction → clipboard/file`

It does not call an LLM API or implement translation. It locally renders a current PDF page to PNG or copies original PDF page objects into a smaller PDF, then prepares a stable user-controlled handoff.

## 2. Primary User

- One personal user
- macOS and Google Chrome
- Primarily reads papers, technical PDFs, and textbooks
- Uses an unpacked extension; Chrome Web Store distribution is not a priority
- No accounts, analytics, telemetry, or data collection

## 3. Core User Flows

### Flow A — Current page → Clipboard

In the extension-owned viewer, the current page is determined from viewport position. Clicking **Copy page** analyzes a small local page render for safe content bounds, renders that PDF page independently with PDF.js, crops stable neutral margins, resamples the result to 70%, writes a PNG to the system clipboard, and reports success. Viewer zoom and window dimensions do not determine export quality. Margin detection is deterministic canvas processing and never uses AI or a network request.

### Flow B — Page range → New PDF

Entering `2-11` validates the inclusive range, copies original page objects 2 through 11 with `@cantoo/pdf-lib`, and downloads a ten-page `2-11.pdf`. A single page uses `7.pdf`. It never rasterizes pages to build the PDF.

## 4. Explicit Non-goals

Initial versions do not include:

- LLM API calls or OpenAI/Anthropic/Gemini API keys
- Translation or OCR
- Accounts, backend, database, analytics, or telemetry
- Server uploads of PDF content
- Chrome Web Store optimization
- Direct integration with LLM websites, including automatic navigation, paste, or attachment
- Chrome native PDF viewer DOM manipulation as a core mechanism
- Unnecessary UI frameworks or state managers

All PDF processing is local in the browser.

## 5. Chrome PDF Viewer Constraint

The extension owns a PDF.js viewer. It does not inject the toolbar into Chrome's internal PDF viewer. The popup reads the active tab URL after a user gesture and opens the same URL in the extension viewer when feasible. MVP does not intercept all PDF navigation.

Public URL loading can fail because of authentication, CORS, referrer requirements, expiring URLs, or special document viewers. The fallback is to download the PDF and use the local file picker or drag-and-drop. `file://` access additionally requires Chrome's **Allow access to file URLs** toggle, and direct file URL fetch remains browser-dependent.

## 6. Technical Architecture

- Chrome Extension Manifest V3
- Strict TypeScript and vanilla DOM UI
- Vite multi-entry build
- `pdfjs-dist` for page parsing/rendering, with a locally copied module worker
- `@cantoo/pdf-lib` for page-object extraction
- Chrome `tabs`, `downloads`, and `commands` APIs
- Vitest, ESLint flat config, and Prettier
- No CDN or runtime remote code
- No React: the UI and state graph do not justify a framework

The viewer is the only owner of loaded PDF bytes/document state. The visible viewer page performs clipboard writes because MV3 service workers have no DOM and offscreen documents are not reliably focusable for the Async Clipboard API.

## 7. Project Structure

```text
pdf_readhelper/
├── AGENT.md
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
├── manifest.json
├── public/
│   └── icons/
├── src/
│   ├── background/service-worker.ts
│   ├── clipboard/clipboard.ts
│   ├── popup/{popup.html,popup.ts,popup.css}
│   ├── shared/{constants,errors,filename,messages,range,source,types}.ts
│   ├── ui/{document-toolbar,range-popover,toast}.ts
│   └── viewer/
│       ├── viewer.html
│       ├── viewer.ts
│       ├── viewer.css
│       ├── document-session.ts
│       ├── document-sidebar.ts
│       ├── document-library.ts
│       ├── page-exporter.ts
│       ├── page-renderer.ts
│       ├── page-tracker.ts
│       ├── range-extractor.ts
│       └── render-math.ts
├── tests/
└── dist/                 # generated; do not edit
```

Responsibilities stay separated: loading/session state, visible rendering, page tracking, export rendering, extraction, clipboard, Chrome messaging, and UI components must not collapse into one large module.

## 8. Chrome Permission Policy

- `activeTab`: read the current tab URL only after the user clicks the extension or invokes a command.
- `tabs`: inspect the active tab, open extension viewer tabs, and target the active viewer for commands.
- `downloads`: save generated PDFs and clipboard-fallback PNGs with predictable filenames.
- `commands`: expose the current-page copy keyboard command.
- `clipboardWrite`: allow PNG clipboard writes after asynchronous PDF rendering from the focused extension page.
- Host permissions `http://*/*`, `https://*/*`, and `file:///*`: fetch user-selected/open PDF URLs in the extension viewer. This is broad because PDFs may be hosted anywhere; it is not used for background collection or navigation interception.

No `storage`, `offscreen`, or `<all_urls>` content script is needed in the MVP. The README explains permissions and the `file://` toggle. The extension-page CSP includes `'wasm-unsafe-eval'` because current PDF.js ships local WASM decoders; it does not permit remote code or general string evaluation.

## 9. Security / Privacy

- PDF bytes remain local and are never sent by the extension to any external service.
- No analytics, telemetry, secrets, or API keys.
- No PDF text or byte dumps in logs.
- The extension does not navigate to third-party LLM sites or upload content to them.
- Remote scripts and CDN assets are forbidden by architecture and MV3 CSP.
- The extension does not attempt authentication bypasses or cookie extraction.
- Object URLs and temporary canvases are released after use.

## 10. State Model

`DocumentSession` is the single owner of:

- source descriptor (`local-file`, `remote-url`, or `file-url`)
- original immutable PDF bytes
- PDF.js loading task and document proxy
- total page count
- current page (updated only through `PageTracker` callback)
- zoom mode/scale
- rendered page slots and render lifecycle
- document-level load/error lifecycle

`DocumentLibrary` owns persistent extension-local IndexedDB records. Metadata and file bytes use separate object stores so listing cover/title/page summaries does not read every saved PDF into memory. Each record includes a PDF fingerprint ID, source descriptor, title, small first-page thumbnail, total pages, last-read page, update timestamp, and locally cached PDF bytes.

Short operation state (copying/extracting) belongs to the toolbar controller and is reflected with disabled/busy controls. It must not mutate document state.

## 11. Message Contracts

All service-worker/viewer messages are defined as a TypeScript discriminated union in `src/shared/messages.ts`. Current contracts cover:

- triggering current-page copy in the active viewer

Message names must not be duplicated as magic strings outside the contract module.

## 12. Error Handling

Users receive actionable inline/toast messages for:

- URL fetch or authorization/CORS failure
- local file permission/fetch failure
- corrupt or unsupported PDF
- encrypted/password-protected PDF
- invalid/reversed/out-of-bounds page range
- clipboard failure (with PNG download fallback)
- page render failure
- PDF generation or download failure

Errors are not swallowed. Console output may contain technical error objects during development but never PDF bytes/content.

## 13. Performance Requirements

- Page and thumbnail placeholders are created without rendering every page.
- `IntersectionObserver` renders visible and nearby pages.
- A separate bounded observer lazily renders only nearby sidebar thumbnails.
- A bounded render window releases distant canvases and calls `PDFPageProxy.cleanup()` after render work is complete.
- Render jobs are cancellable and stale results do not overwrite current state.
- Display resolution accounts for `devicePixelRatio`, subject to a pixel cap.
- Export uses an independent scale (default `2.0`) and a maximum pixel count to prevent oversized-page memory spikes.
- Export margin detection uses a separate low-resolution render capped at 640 pixels on its longest side.
- Export canvases are zeroed after blob creation.
- Original bytes are retained once for range extraction; avoid additional long-lived copies.
- Saved-document list reads metadata only; full PDF bytes are loaded only when a document is selected.

## 14. UX Specification

The top bar contains a compact document toolbar with **IMG / Copy** and **PDF / Range** controls. It appears after a document loads and keeps page actions together with navigation. Buttons include `aria-label`, `title`, keyboard focus, and busy/disabled states.

- IMG: copy current page and toast `Page 7 copied`.
- PDF: compact range popover, prefilled with current page; accepts `2`, `2-11`, and spaces; Enter extracts, while `×`, Escape, and outside clicks close it.
- The third sidebar view lists locally saved PDFs using small covers, filenames, and last-read page indicators. Selecting one swaps the active document; its remove button deletes only the cached extension copy.
- No `alert()`; use non-blocking accessible live-region toasts.

## 15. Keyboard Shortcuts

Manifest commands:

- `copy-current-page`: suggested macOS `Command+Shift+C`, other platforms `Ctrl+Shift+C`

Commands target an active PDF Read Helper viewer and show an in-viewer error if no document is loaded. Users can remap at `chrome://extensions/shortcuts`. Chrome may reject/conflict with suggested shortcuts; this requires manual verification.

## 16. PDF Loading Strategy

Supported inputs:

1. Local file picker (required and most reliable)
2. Drag-and-drop local PDF (required)
3. Public `http(s)` PDF URL passed from popup or pasted into the viewer
4. Direct `file://` URL where Chrome grants access

Local files are read as `ArrayBuffer` and loaded by bytes. Remote/file URLs are fetched by the extension page, validated for successful response, then loaded by bytes to preserve the source for extraction. Authenticated or CORS-restricted sources may fail; no credential bypass is attempted.

## 17. PDF Viewer Requirements

The viewer provides continuous vertical scrolling, current/total page display, zoom in/out, separate fit-width and fit-height icon controls, direct page navigation, local picker/drop, and a dark neutral surround with white pages. A collapsible left sidebar switches between lazy page thumbnails, the PDF's embedded outline, and saved documents. Thumbnail and outline navigation scroll the main viewer to the selected page; named outline destinations are resolved through PDF.js. Saved-document selection restores its last-read page. Canvas page and thumbnail rendering is lazy and bounded.

Selectable text and annotations/links are deferred from the first stable MVP because PDF.js text/annotation layer APIs change frequently and require version-pinned browser validation. This limitation must remain visible in README/status rather than being implied as complete.

## 18. Current Page Detection

`PageTracker` scores page slots from viewport intersection plus distance to viewport center. It updates only when the best candidate meaningfully beats the current page, reducing boundary flicker. Current page is always one-based in UI/domain state.

## 19. PNG Export

`page-exporter.ts` obtains the PDF.js page and renders a low-resolution local analysis canvas. `content-bounds.ts` estimates a dominant neutral border color, ignores isolated pixel noise through row/column projections, and returns padded content bounds. Colored full-bleed, blank, unstable-border, and otherwise uncertain pages fall back to full-page bounds. The page exporter then renders a new temporary source canvas at scale `2.0`, reduced as needed to honor the pixel cap, maps the detected bounds into source pixels, and resamples the cropped result to 70%. It does not capture the screen, use AI/OCR, or depend on viewer zoom. Output is PNG only.

## 20. Clipboard

The focused viewer page uses:

```ts
navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
```

with `clipboardWrite`. If it fails, the PNG is downloaded and the toast explicitly says so. No offscreen clipboard document is used. Actual image clipboard behavior requires manual Chrome verification.

## 21. Range PDF Extraction

`@cantoo/pdf-lib` loads original bytes, copies the entire inclusive zero-based index list in one `copyPages` call, appends those pages, saves bytes, and passes a blob URL to `chrome.downloads.download`.

- `2-11` → indices 1 through 10 → 10 pages → `2-11.pdf`
- `7` → index 6 → 1 page → `7.pdf`

The extraction preserves normal page text/vector/image/layout/page dimensions. Known library limitations include encrypted PDFs, malformed PDFs, outlines/bookmarks, forms/annotation cross-references, and digital signatures.

## 22. External Handoff

The extension stops at copying a page PNG or downloading an extracted PDF. Opening another application and pasting or attaching the result remains explicitly user-controlled. Direct ChatGPT navigation/focus was removed after runtime verification showed it was not reliable enough to ship.

## 23. Options / Settings

MVP uses named constants for export scale, pixel cap, and render margin. A settings/options page is deferred until real usage identifies useful controls. Do not add `storage` permission until settings exist.

## 24. Accessibility

- Native buttons and inputs
- Visible `:focus-visible` outlines
- `aria-label`, `title`, `aria-current`, `aria-selected`, `aria-expanded`, `aria-controls`, and live-region status
- Escape closes popovers; Enter submits ranges/page navigation
- Busy state conveyed in text/ARIA, not only color
- Sufficient contrast when controls are active

## 25. Testing Strategy

Unit tests cover:

- range parsing/validation and one-based to zero-based conversion
- `2-11` produces indices 1–10 and count 10
- `1`, `1-1`, reversed, zero, malformed, and out-of-bounds ranges
- filename generation (`7.pdf`, `2-11.pdf`)
- URL/source classification and query normalization
- current-page scoring/hysteresis helper
- export-scale pixel cap calculation
- fit-width and fit-height scale calculation
- saved-document title derivation
- PDF extraction using an in-memory generated fixture and output page-count/page-size checks

Manual Chrome matrix covers public URL, local picker/drop, one/10+/100+ pages, landscape/mixed sizes, invalid/encrypted PDF, clipboard PNG, worker CSP, URL/file access, commands, and memory behavior.

## 26. Build / Verification Commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
```

`npm run check` runs typecheck, lint, tests, and production build. `dist/` is generated by build.

## 27. Chrome Manual Installation Runbook

1. `npm install`
2. `npm run build`
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select `<project>/dist`
7. Pin PDF Read Helper
8. Open the extension and choose a local PDF, or open a public PDF URL and use the popup
9. For direct `file://` URLs: extension Details → **Allow access to file URLs** → ON
10. Remap shortcuts at `chrome://extensions/shortcuts` if needed

## 28. Known Limitations

- No toolbar injection into Chrome's internal PDF viewer.
- Public/authenticated PDF URLs may fail due to CORS/auth/session restrictions.
- Direct `file://` fetch requires the Chrome toggle and must be manually tested.
- PDF.js worker loading under MV3 CSP must be manually tested in Chrome.
- Image clipboard writes must be manually tested in a focused extension tab.
- Selectable text and annotation/link layers are deferred.
- External-URL outline entries are displayed but intentionally not opened; internal page destinations are supported.
- Encrypted PDFs and some malformed/signed/form-heavy documents may not extract correctly.
- Very large PDFs/pages remain bounded by browser memory despite lazy rendering and pixel limits.
- Persisting many very large PDFs may hit Chrome's origin storage quota; users can remove cached copies without deleting originals.

## 29. Current Status

### Completed

- [x] Empty project and local toolchain inspected
- [x] Chrome MV3, Clipboard, PDF.js, and PDF extraction constraints researched
- [x] Architecture and long-term project instructions documented
- [x] TypeScript/Vite/MV3 foundation, popup, and service worker
- [x] Extension-owned PDF.js viewer with local picker, drag/drop, URL loading, navigation, zoom, separate fit width/height controls, lazy rendering, and current-page tracking
- [x] Collapsible thumbnail/outline sidebar with lazy thumbnail rendering, current-page sync, nested outline expansion, and named-destination navigation
- [x] Third sidebar view with local PDF covers/titles, document switching, cached-copy removal, and per-document last-page restoration
- [x] Top document toolbar, accessible range popover, and toast feedback
- [x] Independent current-page PNG rendering, clipboard write, and fallback download
- [x] Local per-page neutral-margin detection, safe padded crop, full-page fallback, and 70% PNG resampling
- [x] Inclusive original-page PDF extraction with `7.pdf` / `2-11.pdf` naming
- [x] README installation, usage, privacy, limitations, troubleshooting, and manual test runbook
- [x] Removed unreliable GPT Send integration, its scripting permission, and its keyboard command
- [x] Range popover close button, Escape close, and outside-click dismissal
- [x] Automated typecheck, lint, 26 unit/integration tests, production build, and distribution manifest/asset validation
- [x] Fixed CSS `[hidden]` handling after live Chrome testing showed empty/drop overlays covering rendered pages

### In progress

- [ ] Manual testing in a normally launched Chrome profile

### Next

1. Load `dist/` unpacked and complete the README manual verification checklist, including crop safety on normal, scanned, dark, blank, and colored pages.
2. Fix any Chrome-runtime issues found in worker loading, clipboard, adaptive cropping, file URLs, or shortcut dispatch.
3. After stable verification, consider selectable text/link layers.

### Blockers

- The installed branded Google Chrome rejects command-line `--load-extension`/`--disable-extensions-except`, so automated headless extension loading was not possible. Manual unpacked-extension verification is required.

## 30. Decision Log

### 2026-09-08 — Use an extension-owned PDF.js viewer

**Decision:** Do not modify Chrome's internal PDF viewer; open PDFs in a custom extension page.

**Reason:** Reliable control over current-page tracking, page rendering, lazy resource management, overlay UI, and original-page extraction.

**Consequences:** URL/file loading needs an explicit handoff and may fail for authenticated/CORS-restricted sources.

### 2026-09-08 — Use vanilla TypeScript and Vite

**Decision:** Avoid React and state-management dependencies.

**Reason:** The viewer has a small, imperative UI with one document-session owner; a framework adds bundle and maintenance cost without a concrete benefit.

### 2026-09-08 — Use `@cantoo/pdf-lib`

**Decision:** Use the actively maintained fork rather than the long-stale `pdf-lib` 1.17.1 package.

**Reason:** It retains the familiar `PDFDocument`/`copyPages` workflow while receiving current maintenance. Compatibility is locked and verified with extraction tests.

### 2026-09-08 — Clipboard writes occur in the visible viewer

**Decision:** Render and call Async Clipboard from the focused extension viewer page.

**Reason:** Service workers have no DOM; offscreen documents cannot reliably meet clipboard focus requirements. `clipboardWrite` avoids transient-activation expiry during asynchronous rendering.

### 2026-09-08 — Remove direct ChatGPT integration

**Decision:** Remove GPT Send, site navigation/focus code, the scripting permission, and the related keyboard command. External handoff ends at copied or downloaded content.

**Reason:** Runtime verification showed that the browser-to-site handoff was not reliable enough to present as a working feature.

### 2026-09-08 — Lazy document navigation sidebar

**Decision:** Provide Chrome-like thumbnail and outline views in an extension-owned sidebar, and split fit-width from fit-height using directional icons.

**Reason:** Long technical PDFs need fast visual and structural navigation. Lazy thumbnail rendering preserves the existing bounded-memory design, while PDF.js destinations provide reliable internal outline navigation.

### 2026-09-08 — Persist saved documents and page positions in IndexedDB

**Decision:** Store PDF metadata and bytes in separate extension-local IndexedDB object stores, keyed by PDF fingerprint. Restore the last-read page when a saved document is reopened.

**Reason:** A document switcher needs locally reopenable content, including local files whose original file handle cannot be retained across restarts. Separating metadata from bytes keeps shelf listing lightweight and requires no additional Chrome permission.

### 2026-09-08 — Detect export margins locally before copying

**Decision:** Analyze each page with a bounded low-resolution canvas, crop only when a stable neutral border background is detected, retain safety padding, and resample the cropped PNG to 70%. Fall back to the complete page whenever detection is uncertain.

**Reason:** Removing empty page pixels lowers clipboard payload and future vision-input cost without paying for an AI preprocessing call. Conservative full-page fallback protects colored covers and unusual layouts.
