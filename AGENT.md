# PDF Read Helper

This document is the single source of truth for product scope, architecture, constraints, and project status. Read it before changing code and update it before ending a development session.

## 1. Mission

PDF Read Helper reduces the repeated friction involved in reading and translating pages from papers and technical books:

`PDF reading → local page preparation → clipboard/file or explicit translation`

It locally renders a current PDF page to PNG or copies original PDF page objects into a smaller PDF. An optional, explicitly user-triggered panel sends only the prepared current-page image to the OpenAI Responses API and stores the returned translation locally.

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

### Flow C — Current page → Korean translation

Opening the right translation panel does not make a request. The user enters an OpenAI API key for the current viewer tab and explicitly clicks **Translate page**. The viewer uses the same locally cropped/resampled PNG pipeline as clipboard copy, sends one image with a translation instruction through the Responses API, displays the Korean result, and caches it by PDF fingerprint, page, model, and capture version. Revisiting a cached page does not create another request unless the user clicks **Translate again**.

## 4. Explicit Non-goals

Initial versions do not include:

- Persistent API-key storage, accounts, a backend, analytics, or telemetry
- Automatic translation while scrolling or bulk whole-document translation
- OCR or text-layer extraction as the primary translation path
- Anthropic, Gemini, or other non-OpenAI model providers
- Chrome Web Store optimization
- Direct integration with LLM websites, including automatic navigation, paste, or attachment
- Chrome native PDF viewer DOM manipulation as a core mechanism
- Unnecessary UI frameworks or state managers

All PDF parsing, rendering, cropping, and extraction are local in the browser. Only an explicitly selected current-page image leaves the device for translation.

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
│   ├── translation/{openai-translation,translation-cache}.ts
│   ├── ui/{document-toolbar,range-popover,toast,translation-panel}.ts
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

OpenAI requests use the browser `fetch` API rather than bundling an SDK. The API client owns request/response parsing only; the translation panel owns the session key and UI state; the cache owns persisted translation records; the viewer coordinates those modules with the active document.

## 8. Chrome Permission Policy

- `activeTab`: read the current tab URL only after the user clicks the extension or invokes a command.
- `tabs`: inspect the active tab, open extension viewer tabs, and target the active viewer for commands.
- `downloads`: save generated PDFs and clipboard-fallback PNGs with predictable filenames.
- `commands`: expose the current-page copy keyboard command.
- `clipboardWrite`: allow PNG clipboard writes after asynchronous PDF rendering from the focused extension page.
- Host permissions `http://*/*`, `https://*/*`, and `file:///*`: fetch user-selected/open PDF URLs in the extension viewer. This is broad because PDFs may be hosted anywhere; it is not used for background collection or navigation interception.

No `storage`, `offscreen`, or `<all_urls>` content script is needed in the MVP. The README explains permissions and the `file://` toggle. The extension-page CSP includes `'wasm-unsafe-eval'` because current PDF.js ships local WASM decoders; it does not permit remote code or general string evaluation.

## 9. Security / Privacy

- PDF bytes remain local. Only a prepared image of the current page is sent to OpenAI after an explicit Translate action.
- No analytics or telemetry. API keys are never committed, logged, or persisted; the translation panel retains the entered key only in the current tab's JavaScript memory.
- No PDF text or byte dumps in logs.
- Translation requests set `store: false`; returned text is stored only in extension-local IndexedDB for page reuse.
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

`TranslationCache` owns a separate IndexedDB database keyed by capture version, model, PDF fingerprint, and page. It stores translated text, token usage, model name, and update time, but never stores an API key or page image.

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
- missing/rejected OpenAI API keys, rate/spending limits, network failures, empty API output, and translation-cache failures

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

The top bar contains a compact document toolbar with **IMG / Copy**, **PDF / Range**, and **AI / Translate** controls. It appears after a document loads and keeps page actions together with navigation. When idle, non-page controls animate upward while the remaining actions/page field stay translucently in their exact expanded-toolbar positions. Buttons include `aria-label`, `title`, keyboard focus, and busy/disabled states.

- IMG: copy current page and toast `Page 7 copied`.
- PDF: compact range popover, prefilled with current page; accepts `2`, `2-11`, and spaces; Enter extracts, while `×`, Escape, and outside clicks close it.
- The third sidebar view lists locally saved PDFs using small covers, filenames, and last-read page indicators. Selecting one swaps the active document; its remove button deletes only the cached extension copy.
- AI opens a closable right panel. Its key form explains session-only handling and external page-image transmission. Translation never starts from scrolling or merely opening the panel. Cached results appear automatically and can be copied as text; explicit retranslation replaces the cached result.
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

The viewer provides continuous vertical scrolling, current/total page display, zoom in/out, separate fit-width and fit-height icon controls, direct page navigation, local picker/drop, and a dark neutral surround with white pages. When the pointer leaves the full top toolbar, non-page controls slide upward while IMG, PDF, AI, and current/total page remain fixed in their expanded-toolbar positions over a transparent bar. The full controls animate back from a 14px full-width top-edge hover target or keyboard focus. A collapsible left sidebar switches between lazy page thumbnails, the PDF's embedded outline, and saved documents. When enabled, it rests as a 48px icon rail and expands as an overlay on hover/focus so it never reduces the PDF viewport width. Thumbnail and outline navigation scroll the main viewer to the selected page; named outline destinations are resolved through PDF.js. Saved-document selection restores its last-read page. Canvas page and thumbnail rendering is lazy and bounded.

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

## 22. External Handoff and Translation

Clipboard and extracted-PDF handoff remain explicitly user-controlled. Direct ChatGPT navigation/focus was removed after runtime verification showed it was not reliable enough to ship. Integrated translation is a separate explicit OpenAI API request; it does not navigate to or automate the ChatGPT website.

## 23. Options / Settings

MVP uses named constants for export scale, pixel cap, render margin, and translation model. A persistent settings/options page is deferred until real usage identifies useful controls. The API key is intentionally session-memory-only, so no `storage` permission is needed.

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
- OpenAI Responses text extraction and translation cache-key separation
- PDF extraction using an in-memory generated fixture and output page-count/page-size checks

Manual Chrome matrix covers public URL, local picker/drop, one/10+/100+ pages, landscape/mixed sizes, invalid/encrypted PDF, clipboard PNG, OpenAI translation, cached results, session-key clearing, worker CSP, URL/file access, commands, and memory behavior.

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
- Integrated translation requires the user's own billed OpenAI API key and network access. The key is forgotten when the viewer tab closes.
- Direct browser-held bearer credentials are for this private unpacked extension only; a public build requires a server-side credential design.

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
- [x] Explicit right-side OpenAI page translation, session-only API key, local page cache, token display, and translation copy
- [x] Animated auto-compacting top chrome with position-stable retained controls and a hover-expanding overlay sidebar
- [x] Inclusive original-page PDF extraction with `7.pdf` / `2-11.pdf` naming
- [x] README installation, usage, privacy, limitations, troubleshooting, and manual test runbook
- [x] Removed unreliable GPT Send integration, its scripting permission, and its keyboard command
- [x] Range popover close button, Escape close, and outside-click dismissal
- [x] Automated typecheck, lint, 35 unit/integration tests, production build, and distribution manifest/asset validation
- [x] Fixed CSS `[hidden]` handling after live Chrome testing showed empty/drop overlays covering rendered pages

### In progress

- [ ] Manual testing in a normally launched Chrome profile

### Next

1. Load `dist/` unpacked and complete the README manual verification checklist, including auto-hide interaction, crop safety, and an API translation request with a low-limit test key.
2. Fix any Chrome-runtime issues found in viewer chrome, worker loading, clipboard, adaptive cropping, OpenAI requests, file URLs, or shortcut dispatch.
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

### 2026-09-08 — Optional session-only OpenAI page translation

**Decision:** Add an explicitly user-triggered right-side translation panel backed by the OpenAI Responses API. The personal API key is entered by the user, retained only in the current viewer tab's memory, never persisted or logged, and cleared when the tab closes or the user removes it. Requests use the same locally cropped page PNG as clipboard export, set `store: false`, and cache only returned translations in extension-local IndexedDB.

**Reason:** The product is a private unpacked extension for one user, and the requested workflow benefits from an integrated page translation view. Session-only handling limits key persistence while keeping the interaction practical.

**Consequences:** Direct client-side bearer credentials are not appropriate for a distributed extension and conflict with OpenAI's production guidance to keep API keys on a server. Any future public distribution must replace this path with a backend issuing short-lived credentials or proxying requests. The UI and README must disclose that page images are sent to OpenAI only after the user clicks Translate.

### 2026-09-08 — Auto-hide viewer chrome without shrinking the PDF

**Decision:** After pointer leave, animate non-page toolbar controls upward without removing their layout slots, leaving translucent IMG/PDF/AI actions and the page field at the exact same coordinates they occupy when expanded. Restore the full toolbar through a 14px full-width top-edge hover target or keyboard focus. Turn the enabled left sidebar into a 48px rail whose content expands as an overlay on hover/focus.

**Reason:** Persistent document-opening and navigation controls consumed reading space after a PDF was already open. Retaining layout slots prevents the always-visible controls from jumping when the bar changes state, while the wider reveal strip and matched motion make recovery predictable.
