# PDF Read Helper

This document is the single source of truth for product scope, architecture, constraints, and project status. Read it before changing code and update it before ending a development session.

## 1. Mission

PDF Read Helper reduces the repeated friction involved in reading and translating pages from papers and technical books:

`PDF reading → local page preparation → clipboard/file or explicit translation`

It locally renders a current PDF page to PNG or copies original PDF page objects into a smaller PDF. An optional, explicitly user-triggered panel sends only the prepared current-page image to the selected Gemini or OpenAI API and stores the returned translation locally.

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

Opening the right translation panel does not make a request. The user selects Gemini or OpenAI plus one of that provider's configured models, enters the provider API key for the current viewer tab, and explicitly clicks **Translate page**. The viewer uses the same locally cropped/resampled PNG pipeline as clipboard copy, sends one image with a translation instruction through the selected provider/model API, displays the Korean result, and caches it by provider, model, PDF fingerprint, page, and capture version. Revisiting a cached page does not create another request unless the user clicks **Translate again**.

## 4. Explicit Non-goals

Initial versions do not include:

- Persistent API-key storage, accounts, a backend, analytics, or telemetry
- Automatic translation while scrolling or bulk whole-document translation
- OCR or text-layer extraction as the primary translation path
- Translation providers beyond Gemini and OpenAI, arbitrary model selection, or a general LLM plugin system
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
│   ├── translation/{translation-provider,translation-providers,gemini-translation,openai-translation,translation-cache}.ts
│   ├── ui/{document-toolbar,focus-mode,keyboard-shortcuts-popover,range-popover,reading-theme-picker,toolbar-overflow,toast,translation-panel,url-popover}.ts
│   └── viewer/
│       ├── viewer.html
│       ├── viewer.ts
│       ├── viewer.css
│       ├── document-session.ts
│       ├── document-sidebar.ts
│       ├── document-library.ts
│       ├── page-exporter.ts
│       ├── page-content-bounds.ts
│       ├── page-navigation-history.ts
│       ├── page-flow.ts
│       ├── page-renderer.ts
│       ├── page-tracker.ts
│       ├── range-extractor.ts
│       ├── original-document.ts
│       ├── page-bookmarks.ts
│       └── render-math.ts
├── tests/
└── dist/                 # generated; do not edit
```

Responsibilities stay separated: loading/session state, visible rendering, page tracking, export rendering, extraction, clipboard, Chrome messaging, and UI components must not collapse into one large module.

Gemini and OpenAI requests use the browser `fetch` API rather than bundling SDKs. A small provider contract isolates configured models and request/response parsing; the translation panel owns provider/model selection, provider-specific session keys, and UI state; the cache owns persisted translation records; the viewer coordinates those modules with the active document.

## 8. Chrome Permission Policy

- `activeTab`: read the current tab URL only after the user clicks the extension or invokes a command.
- `tabs`: inspect the active tab, open extension viewer tabs, and target the active viewer for commands.
- `downloads`: save generated PDFs and clipboard-fallback PNGs with predictable filenames.
- `commands`: expose the current-page copy keyboard command.
- `clipboardWrite`: allow PNG clipboard writes after asynchronous PDF rendering from the focused extension page.
- Host permissions `http://*/*`, `https://*/*`, and `file:///*`: fetch user-selected/open PDF URLs in the extension viewer. This is broad because PDFs may be hosted anywhere; it is not used for background collection or navigation interception.

No `storage`, `offscreen`, or `<all_urls>` content script is needed in the MVP. The README explains permissions and the `file://` toggle. The extension-page CSP includes `'wasm-unsafe-eval'` because current PDF.js ships local WASM decoders; it does not permit remote code or general string evaluation.

## 9. Security / Privacy

- PDF bytes remain local. Only a prepared image of the current page is sent to the selected Gemini or OpenAI API after an explicit Translate action.
- No analytics or telemetry. API keys are never committed, logged, or persisted; the translation panel retains separate Gemini and OpenAI keys only in the current tab's JavaScript memory.
- No PDF text or byte dumps in logs.
- OpenAI translation requests set `store: false`; returned Gemini/OpenAI text is stored only in extension-local IndexedDB for page reuse.
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
- zoom mode/scale, including manual, fit-width, fit-height, and local content-fit intent (reset before a saved document's view is restored)
- document-session view rotation (`0`, `90`, `180`, or `270` degrees; reset before saved-state restoration)
- page layout (`single` continuous column or cover-first `spread`; reset before saved-state restoration)
- rendered page slots and render lifecycle
- document-level load/error lifecycle

`DocumentLibrary` owns persistent extension-local IndexedDB records. Metadata and file bytes use separate object stores so listing cover/title/page summaries does not read every saved PDF into memory. Each record includes a PDF fingerprint ID, source descriptor, title, small first-page thumbnail, total pages, last-read page, optional manual/Fit zoom state, rotation, single/spread layout, update timestamp, optional user-defined sort order, and locally cached PDF bytes. View state is optional for schema compatibility; legacy records receive safe defaults without an IndexedDB migration. Legacy records without a sort order remain newest-first until the user drags the list; new unordered documents appear before an existing manual sequence.

`TranslationCache` owns a separate IndexedDB database keyed by capture version, provider, model, PDF fingerprint, and page. It stores translated text, token usage, provider/model identity, and update time, but never stores an API key or page image. Legacy OpenAI cache keys remain readable.

`ReadingThemePicker` owns one viewer-wide `original`, `sepia`, or `dark` display preference in extension-page `localStorage`. It changes CSS presentation only and is intentionally separate from document state and exported content.

`PageBookmarkStore` owns a separate IndexedDB database keyed by PDF fingerprint and one-based page number. Bookmark records contain a short locally extracted or user-edited page title, an optional 240-character local note, creation time, and optional update time; they never contain PDF bytes or network-derived content. Optional fields keep existing bookmark records schema-compatible without an IndexedDB migration. Removing a saved document also removes its bookmarks.

`PageNavigationHistory` owns bounded, in-memory previous/next page-jump state for the active document. It records explicit jumps rather than ordinary scrolling, updates the location being left to the actual current page, discards the forward branch after a new jump, and resets whenever another PDF opens.

`FocusMode` owns temporary distraction-free state and the browser Fullscreen API handshake. It hides viewer chrome without changing sidebar or translation-panel open state, restores normal UI when native fullscreen ends, and remains usable as an in-page focus mode when Chrome rejects the fullscreen request.

The viewer-wide `PageFlow` preference is `continuous` or `paged` and persists in extension-page `localStorage`. Paged flow exposes only the active single page or cover-first spread while retaining the same bounded renderer, page tracker, layout state, and current-page action target. It is separate from per-document `PageLayout`, which still resets to single when another document opens.

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
- missing/rejected Gemini or OpenAI API keys, rate/quota/spending limits, network failures, blocked/empty API output, and translation-cache failures

Errors are not swallowed. Console output may contain technical error objects during development but never PDF bytes/content.

## 13. Performance Requirements

- Page and thumbnail placeholders are created without rendering every page.
- `IntersectionObserver` renders visible and nearby pages.
- A separate bounded observer lazily renders only nearby sidebar thumbnails.
- A bounded render window releases distant canvases and calls `PDFPageProxy.cleanup()` after render work is complete.
- Link annotations are fetched and overlaid only for pages inside the same bounded render window; distant link DOM is removed with its canvas and text layer.
- Render jobs are registered before asynchronous page lookup, deduplicated per page, and cancellable. Zoom changes wait for an invalidated render to settle before reusing its canvas; disposed document renderers cannot restart, surface stale errors, or mutate the next document.
- Display resolution accounts for `devicePixelRatio`, subject to a pixel cap.
- Export uses an independent scale (default `2.0`) and a maximum pixel count to prevent oversized-page memory spikes.
- Export margin detection uses a separate low-resolution render capped at 640 pixels on its longest side.
- Export canvases are zeroed after blob creation.
- Original bytes are retained once for range extraction, unchanged download, and native PDF print handoff; avoid additional long-lived copies.
- Saved-document list reads metadata only; full PDF bytes are loaded only when a document is selected.

## 14. UX Specification

The top bar keeps its opening actions on the left and one compact page-control group on the right, ordered zoom out, zoom in, fit height, fit width, fit detected content, More, IMG, PDF, AI, and current/total page. Content Fit uses the same deterministic low-resolution neutral-margin detection as PNG export, scales the entire current page so its padded content box fits both available dimensions, then centers that box without changing PDF coordinates or exported content. Uncertain bounds fall back to full-page Fit. More exposes a labeled three-column grid containing rotation, page layout, page flow, previous/next view, focus mode, reading theme, current-page bookmark, search, original download/print, and a keyboard-shortcut reference. **Open URL** reveals a compact form instead of permanently reserving space for an input. When idle, non-page controls animate upward while the remaining IMG/PDF/AI actions and page field stay translucently in their exact expanded-toolbar positions. Buttons include `aria-label`, `title`, keyboard focus, and busy/disabled states.

- IMG: copy current page and toast `Page 7 copied`.
- PDF: compact range popover, prefilled with current page; accepts `2`, `2-11`, and spaces; Enter extracts, while `×`, Escape, and outside clicks close it.
- Reading theme: palette popover with Original, Sepia, and Dark radio-style options; selection persists locally and supports arrow-key changes.
- The third sidebar view lists locally saved PDFs using small covers, filenames, and last-read page indicators. Selecting one swaps the active document and restores its page, manual zoom or Fit mode, rotation, and single/spread layout. Its remove button deletes only the cached extension copy. A visible grip supports drag reordering, which is persisted in IndexedDB.
- The fourth sidebar view lists the active PDF's bookmarked pages by title, optional short note, and page number. Selecting one navigates to it; `✎` opens an inline title/note editor and `×` removes it. Enter saves edits, while Escape or Cancel restores the row without changes. A blank edited title falls back to `Page N`. The toolbar ribbon toggles the current page and exposes its state with `aria-pressed`.
- Previous/next view buttons traverse explicit page jumps from thumbnails, outline entries, bookmarks, search results, PDF links, the page field, and Home/End. Continuous scrolling does not flood the history; the actual page visible when the reader next jumps replaces that departure point. Opening another PDF clears the history.
- Focus mode requests browser fullscreen and hides the complete top toolbar, sidebar, and translation panel while retaining their underlying open state for restoration. F or Escape exits; failure to obtain browser fullscreen leaves the in-page distraction-free mode active with a toast explanation.
- Page flow toggles between the existing continuous stack and a persisted page-turn presentation. Paged flow reveals only the active page in single layout or the active cover-first pair in spread layout, centers short pages safely, retains scrolling for oversized/zoomed pages, and shows translucent edge turn buttons. Returning to continuous flow unhides the existing slots without recreating the document.
- AI opens a translucent right overlay without narrowing the PDF viewport. Its main surface is a lightweight conversation: a fixed page-translation request, a long scrolling response, persistent inline request errors, and a bottom row containing Translate, Settings, and Close. A gear popover opens upward from that row and contains provider/model selection plus provider-specific key replacement/deletion, keeping configuration out of the reading flow. Translation never starts from scrolling, opening the panel, or switching providers/models. Each provider/model's cached result appears automatically and can be copied as text; explicit retranslation replaces only that selection's cached result.
- More closes after direct actions, Escape, or an outside pointer action. Theme and search remain nested interactive popovers; shortcut help opens as an independent sibling panel so it remains visible after More closes. Ctrl/Command+F opens More before focusing search so the keyboard path remains visible and usable.
- No `alert()`; use non-blocking accessible live-region toasts.

## 15. Keyboard Shortcuts

Manifest commands:

- `copy-current-page`: suggested macOS `Command+Shift+C`, other platforms `Ctrl+Shift+C`

Inside the viewer, unmodified `Command+C` on macOS and `Ctrl+C` elsewhere invoke the same busy-state-managed action as the IMG button. The viewer preserves native copy when focus is in an input, textarea, select, or editable element, or when the user has selected text. Repeated or already-handled key events and shortcuts with Shift/Alt are ignored. Manifest commands target an active PDF Read Helper viewer and show an in-viewer error if no document is loaded. Users can remap the Shift variant at `chrome://extensions/shortcuts`. Chrome may reject/conflict with suggested manifest shortcuts; this requires manual verification.

`Command+F` on macOS and `Ctrl+F` elsewhere open the extension's PDF search popover. Search extracts and caches each page's embedded text in memory with bounded concurrency, maps matches back to the lazy visible text layers, and uses Enter/Shift+Enter or arrow buttons for wrapped next/previous navigation. Scanned pages require an existing OCR text layer; the extension does not run OCR.

When focus is in the PDF reading surface, Space/PageDown advance by 88% of the viewport, Shift+Space/PageUp move backward by the same amount, and Home/End navigate to the first/last page. These document-level shortcuts ignore repeated, modified, and already-handled events. Native key behavior remains available in interactive controls, links, the sidebar, the translation panel, and while real text is selected.

In paged flow, unmodified Left/Right Arrow turn the previous/next single page or cover-first spread. Space/PageDown and Shift+Space/PageUp reuse the same turn operation instead of viewport scrolling. Page turns do not populate explicit jump history; direct page, outline, bookmark, search, link, and Home/End jumps continue to do so.

Alt+Left Arrow and Alt+Right Arrow traverse the active PDF's previous/next page-jump locations when that direction exists. They do not intercept input, textarea, select, or editable-element behavior, and they leave the browser chord untouched when no corresponding internal history entry exists.

An unmodified F toggles focus/fullscreen mode when focus is outside editable controls, and Escape exits while it is active. Native fullscreen exit is also synchronized through `fullscreenchange`, so Chrome's own Escape handling restores the viewer chrome.

Within an open viewer document, unmodified Ctrl/Command+S downloads the unchanged original PDF rather than the extension viewer HTML, and Ctrl/Command+P invokes the original-PDF print handoff. Repeated, shifted, alt-modified, and already-handled events retain browser behavior.

## 16. PDF Loading Strategy

Supported inputs:

1. Local file picker (required and most reliable)
2. Drag-and-drop local PDF (required)
3. Public `http(s)` PDF URL passed from popup or pasted into the viewer
4. Direct `file://` URL where Chrome grants access

Local files are read as `ArrayBuffer` and loaded by bytes. Remote/file URLs are fetched by the extension page, validated for successful response, then loaded by bytes to preserve the source for extraction. Authenticated or CORS-restricted sources may fail; no credential bypass is attempted.

## 17. PDF Viewer Requirements

The viewer provides persistent continuous-scroll and page-turn flows, current/total page display, bounded previous/next page-jump history, a temporary focus/fullscreen mode, zoom in/out, separate fit-width, fit-height, and AI-free content-fit icon controls, clockwise 90-degree view rotation, single-column and cover-first two-page spread layouts, persistent Original/Sepia/Dark display themes, editable per-PDF page bookmarks with short notes, original download/print controls, direct page navigation, local picker/drop, and a dark neutral surround with white pages. Direct toolbar space is reserved for zoom, fit, More, IMG/PDF/AI, and the page field; secondary view/navigation/document commands and an in-viewer keyboard reference live in More rather than overflowing narrow windows. Content Fit caches page/rotation measurements for the active document, remains a one-shot current-page operation in continuous flow to avoid zoom jumps while scrolling, and recalculates on page changes in page-turn flow. Page-turn mode also debounces viewer border-box resizes and reapplies the active width, height, or content Fit after layout settles, keeping a page consistent when the browser window changes the available area. In spread mode page 1 spans both grid columns alone, followed by 2–3, 4–5, and later pairs; fit-width and content-fit reserve half the available width per sheet. Paged flow hides non-active slots instead of building a second renderer, while continuous flow restores the complete vertical stack. Reading themes filter only visible main-page canvases; thumbnails and IMG/AI/PDF/print outputs remain source-colored. URL input is available on demand from an **Open URL** popover with close button, Escape, and outside-click dismissal. When the pointer leaves the full top toolbar, non-page controls slide upward while the adjacent IMG, PDF, AI, and current/total page controls remain fixed in their expanded-toolbar positions over a transparent bar. The full controls animate back from a 14px full-width top-edge hover target or keyboard focus. A left-edge reveal strip slides the full sidebar over the PDF and hides it again after pointer/focus leave, replacing the permanent rail and toolbar hamburger. It switches between lazy page thumbnails, the PDF's embedded outline, saved documents, and the active PDF's bookmarks without reducing viewport width. Its tabs and panel content always reserve the full toolbar height above them, preventing any vertical motion when the independently animated top bar appears. Thumbnail, outline, and bookmark navigation scroll the main viewer to the selected page; named outline destinations are resolved through PDF.js. Saved-document selection restores its last-read page and validated per-document zoom/Fit, rotation, and layout state, while the saved list supports persistent grip-based drag reordering. Canvas page and thumbnail rendering is lazy and bounded.

Visible pages include a PDF.js text layer pinned to the installed `pdfjs-dist` version, enabling selection and native text copy. Full-document search indexes embedded text only when explicitly requested and reuses the in-memory page indexes for later queries in that document session. Search highlights are created only for the bounded set of rendered text layers. A separate minimal link layer accepts only PDF link annotations: internal destinations navigate through the viewer, safe HTTP(S)/email URLs open in a new tab, and common first/last/next/previous named page actions are supported. Forms, attachment actions, annotation editing/popups, and embedded PDF JavaScript remain disabled.

## 18. Current Page Detection

`PageTracker` scores page slots from viewport intersection plus distance to viewport center. It updates only when the best candidate meaningfully beats the current page, reducing boundary flicker. In a two-page row, pointer or focus interaction explicitly selects the left or right sheet so page actions target the intended page rather than an arbitrary tied candidate. Current page is always one-based in UI/domain state.

## 19. PNG Export

`page-exporter.ts` obtains the PDF.js page and renders a low-resolution local analysis canvas using the active view rotation. `content-bounds.ts` estimates a dominant neutral border color, ignores isolated pixel noise through row/column projections, and returns padded content bounds. Colored full-bleed, blank, unstable-border, and otherwise uncertain pages fall back to full-page bounds. The page exporter then renders a new temporary source canvas at scale `2.0`, reduced as needed to honor the pixel cap, maps the detected bounds into source pixels, and resamples the cropped result to 70%. It does not capture the screen, use AI/OCR, or depend on viewer zoom. Output is PNG only.

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

Clipboard and extracted-PDF handoff remain explicitly user-controlled. Direct ChatGPT navigation/focus was removed after runtime verification showed it was not reliable enough to ship. Integrated translation is a separate explicit Gemini or OpenAI API request; it does not navigate to or automate either provider's website.

## 23. Options / Settings

MVP uses named constants for export scale, pixel cap, render margin, and curated translation models. Gemini/OpenAI plus provider-specific model selection lives in the translation panel; arbitrary model-ID entry is intentionally omitted. The lightweight reading-theme preference uses extension-page `localStorage`; a separate settings/options page is deferred until real usage identifies other useful controls. Provider API keys remain intentionally session-memory-only, so no `storage` permission is needed.

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
- safe original filenames for local files and decoded URLs
- reading-theme normalization and storage fallback
- bookmark keying, page sorting, fallback/bounded titles, and optional note normalization/limits
- URL/source classification and query normalization
- current-page scoring/hysteresis helper
- bounded page-jump history, branch replacement, scroll-adjusted departure points, and Alt+Arrow classification
- page-flow normalization/persistence, cover-first visible groups, turn boundaries, and Arrow classification
- export-scale pixel cap calculation
- fit-width, fit-height, and detected-content scale calculation
- clockwise rotation normalization, wrapping, and intrinsic/user rotation composition
- per-page fit-width calculation for single-column and two-page spread layouts
- saved-document title derivation
- saved-document view defaults, validation, and legacy-record compatibility
- Gemini GenerateContent and OpenAI Responses text/usage extraction plus provider-aware translation cache-key separation
- reading-key classification and overlap-preserving viewport offsets
- focus-mode F/Escape shortcut classification and modifier preservation
- PDF extraction using an in-memory generated fixture and output page-count/page-size checks

Manual Chrome matrix covers public URL, local picker/drop, one/10+/100+ pages, landscape/mixed sizes, invalid/encrypted PDF, clipboard PNG, Gemini/OpenAI provider and model switching, provider/model-specific cached results and session-key clearing, worker CSP, URL/file access, commands, and memory behavior.

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
- Browser fullscreen is best-effort and requires a user gesture; if Chrome refuses it, only the extension's in-page focus mode is applied.
- Paged flow changes page-level visibility only; zoomed pages can still require horizontal or vertical scrolling within the current page/spread.
- Desktop Chrome has no general extension API for direct PDF printer submission. Original printing first uses an invisible PDF frame, then falls back to a native PDF viewer tab when framed printing is unavailable.
- PDF.js worker loading under MV3 CSP must be manually tested in Chrome.
- Image clipboard writes must be manually tested in a focused extension tab.
- Scanned/image-only pages are not selectable or searchable unless the PDF contains OCR text.
- Automatic bookmark titles use the first meaningful embedded text item and may reflect a running header; scanned pages fall back to their page number. Titles can be corrected manually and each bookmark supports one short plain-text note.
- Only link annotations are interactive. Form fields, annotation editing/popups, attachments, and embedded PDF JavaScript are intentionally disabled.
- External-URL outline entries are displayed but intentionally not opened; internal page destinations are supported.
- Encrypted PDFs and some malformed/signed/form-heavy documents may not extract correctly.
- Very large PDFs/pages remain bounded by browser memory despite lazy rendering and pixel limits.
- Persisting many very large PDFs may hit Chrome's origin storage quota; users can remove cached copies without deleting originals.
- Integrated translation requires the user's own eligible Gemini or OpenAI API key and network access. Both provider keys are forgotten when the viewer tab closes.
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
- [x] Translucent conversation-style Gemini/OpenAI overlay with bottom Translate/Settings/Close controls, gear-contained provider/model/key settings, persistent inline errors/retry, provider/model-specific local cache, token display, and translation copy
- [x] Animated auto-compacting top chrome with position-stable retained controls and an edge-revealed overlay sidebar
- [x] Inclusive original-page PDF extraction with `7.pdf` / `2-11.pdf` naming
- [x] README installation, usage, privacy, limitations, troubleshooting, and manual test runbook
- [x] Removed unreliable GPT Send integration, its scripting permission, and its keyboard command
- [x] Range popover close button, Escape close, and outside-click dismissal
- [x] Automated typecheck, lint, 101 unit/integration tests, production build, and distribution manifest/asset validation
- [x] Fixed CSS `[hidden]` handling after live Chrome testing showed empty/drop overlays covering rendered pages
- [x] Serialized per-page canvas rendering across document switches and zoom changes
- [x] Consolidated navigation/page actions into one ordered control group and moved URL input into an on-demand popover
- [x] Coordinated toolbar/sidebar overlap spacing and persistent saved-document drag ordering
- [x] Isolated internal shelf reordering from the full-window external-file drop overlay
- [x] Mapped contextual Ctrl/Command+C to the IMG action while preserving native text/input copy
- [x] Added a paper/PDF brand icon as a vector source, Chrome icon PNG sizes, and viewer/popup favicon
- [x] Added lazy selectable text layers and full-document Ctrl/Command+F search with exact result highlights
- [x] Added bounded clickable PDF link overlays for internal destinations and safe external URLs
- [x] Added clockwise document view rotation shared by display, selectable layers, links, IMG, and AI capture
- [x] Added continuous single-column and cover-first two-page spread layouts with per-sheet targeting and fit
- [x] Added contextual Space/PageUp/PageDown/Home/End reading navigation with native-control and text-selection preservation
- [x] Added unchanged original-PDF download/print controls and Ctrl/Command+S/P routing without full-document rerendering
- [x] Added persistent Original/Sepia/Dark display themes isolated from thumbnails and exported content
- [x] Added persistent per-PDF page bookmarks with automatic local titles, sidebar navigation, and removal
- [x] Added inline bookmark title editing and optional short per-page notes with Enter/Escape controls
- [x] Added bounded per-document previous/next page-jump history with toolbar and Alt+Arrow controls
- [x] Added temporary focus/fullscreen reading mode with full viewer-chrome hiding and F/Escape controls
- [x] Added persisted page-turn flow with single/spread grouping, edge controls, and contextual reading keys
- [x] Consolidated secondary toolbar actions into an accessible labeled More panel for narrow-window use
- [x] Persisted and restored per-document manual/Fit zoom, rotation, and single/spread layout state
- [x] Added an in-viewer keyboard shortcut reference under the compact More menu
- [x] Stabilized sidebar content below the toolbar across compact/expanded top-bar states
- [x] Replaced the toolbar hamburger and persistent sidebar rail with left-edge reveal behavior
- [x] Added AI-free current-page Content Fit using cached neutral-margin detection and safe full-page fallback
- [x] Stabilized page-turn Fit sizing across viewer/window resize changes

### In progress

- [ ] Manual testing in a normally launched Chrome profile

### Next

1. Load `dist/` unpacked and complete the README manual verification checklist, including auto-hide interaction, crop safety, and an API translation request with a low-limit test key.
2. Fix any Chrome-runtime issues found in viewer chrome, worker loading, clipboard, adaptive cropping, Gemini/OpenAI requests and switching, file URLs, or shortcut dispatch.
3. Keep reading statistics out of scope; add a settings surface only if repeated real usage exposes a concrete preference that cannot remain a named constant.

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

### 2026-09-08 — Serialize display-canvas rendering

**Decision:** Register each page render before awaiting PDF.js page lookup, share duplicate requests for the same page, wait for invalidated work to settle before reusing its canvas, and permanently dispose renderers when switching documents.

**Reason:** Intersection, navigation, and zoom events can request the same page concurrently. PDF.js forbids overlapping `render()` operations on one canvas, so cancellation alone is insufficient unless the cancelled task has settled before the canvas is used again.

### 2026-09-09 — Consolidate toolbar controls and defer URL input

**Decision:** Keep zoom, fit, IMG/PDF/AI, and the page field in a single right-aligned control group, with page actions directly beside the page field. Preserve URL loading but expose its input through a closable **Open URL** popover.

**Reason:** Page actions and page state are used together and should not be visually separated. URL loading remains useful for public and permitted file URLs, but its text field is an infrequent action that should not permanently consume toolbar width.

### 2026-09-09 — Coordinate overlay chrome and persist shelf order

**Decision:** Animate sidebar contents below the full toolbar whenever it is expanded. Let the user reorder saved documents using a drag grip and persist numeric sort positions in existing IndexedDB metadata records without a schema migration.

**Reason:** The independent top and left overlays otherwise obscure the first sidebar controls when both are open. A persistent manual document order makes the saved shelf behave like user-controlled tabs rather than a volatile recent-files list.

### 2026-09-09 — Distinguish internal and file drags

**Decision:** Activate the full-window PDF drop target only when `DataTransfer.types` contains the browser-standard `Files` entry. Saved-document reordering continues to use `text/plain` and is handled only by the sidebar.

**Reason:** Window-level drag listeners otherwise treat internal shelf reordering as an incoming PDF file and obscure the viewer with the drop overlay.

### 2026-09-09 — Use the native copy chord for page images

**Decision:** Within the viewer, route plain Ctrl/Command+C through the same toolbar operation as IMG unless the user is editing a control or has selected text. Keep the existing configurable Ctrl/Command+Shift+C manifest command.

**Reason:** Before selectable text layers were added, the PDF body was canvas-only, so the standard copy chord was otherwise idle while reading. Context checks retain expected browser copy behavior wherever real text is available now and in controls.

### 2026-09-09 — Use one vector source for extension identity

**Decision:** Keep a font-independent SVG master showing a folded paper sheet and PDF label, and generate 16, 32, 48, and 128px PNG variants for Chrome's manifest/action icons. Use the 32px asset as the popup and viewer favicon.

**Reason:** Chrome needs raster icon sizes while browser tabs need a favicon. A single vector source keeps the dark-and-mint product mark consistent and avoids platform font differences during asset generation.

### 2026-09-09 — Add lazy text layers and explicit full-document search

**Decision:** Render PDF.js text layers only beside the existing bounded nearby-page canvases. Intercept Ctrl/Command+F inside the viewer, build an in-memory embedded-text index with four-page concurrency, and map each result back to exact text-layer ranges using the CSS Custom Highlight API.

**Reason:** Native text selection and document search remove a major gap from Chrome's built-in viewer without adding OCR, network calls, or permanent indexing storage. Keeping text layers within the existing release radius preserves the viewer's bounded DOM and canvas behavior.

**Consequences:** Image-only scans remain unsearchable without embedded OCR text, and text-layer alignment/highlighting still requires manual Chrome validation against mixed-size and rotated PDFs.

### 2026-09-09 — Use a minimal allowlisted PDF link layer

**Decision:** Read link annotations only for lazily rendered pages and create transparent positioned anchors above the text layer. Resolve internal destinations through one shared helper, open only HTTP(S)/email URLs externally, support common page-navigation actions, and ignore all other annotation actions.

**Reason:** Readers need references and web links to work, but PDF.js's complete annotation layer also covers forms, attachments, editing, and script-driven actions that are unnecessary for this private reading workflow. A small allowlisted layer is easier to audit and preserves the existing bounded render lifecycle.

**Consequences:** Link rectangles require manual validation on rotated and mixed-size PDFs. Forms, popup comments, attachments, arbitrary named actions, and embedded PDF JavaScript remain unavailable by design.

### 2026-09-09 — Treat rotation as document-session view state

**Decision:** Add a clockwise toolbar action that cycles the active document through 0°, 90°, 180°, and 270°. Compose this view delta with every page's intrinsic PDF rotation and rerender the bounded canvas, text, search-highlight, and link layers. Apply the same effective rotation to IMG and AI page-image generation, while leaving original-object PDF range extraction unchanged.

**Reason:** Landscape scans and incorrectly oriented pages need a fast reading control. Using one session rotation across display and image handoff prevents the viewer, clipboard, and translation request from disagreeing about orientation.

**Consequences:** Rotation resets when another PDF is opened and does not alter the source PDF. Existing cached translations may still be displayed because their textual meaning is page-based; explicitly translating again sends the currently rotated image.

### 2026-09-09 — Keep two-page reading continuous and cover-first

**Decision:** Add a pressed-state layout control that switches the existing continuous stack between one centered column and a two-column CSS grid. In spread mode page 1 spans both columns as a cover, later pages pair 2–3 and 4–5, pointer/focus chooses the active sheet, and fit-width divides usable width between the two sheets.

**Reason:** Technical books benefit from seeing facing pages while retaining the viewer's current lazy scrolling, search, and page-tracking model. A layout-only grid reuses every existing page slot and avoids a separate paginated renderer or duplicate canvases.

**Consequences:** Spread mode may require horizontal scrolling at large manual zoom levels or on narrow windows. Layout resets to single-column when another PDF opens and does not affect IMG/AI output or extracted PDF structure.

### 2026-09-09 — Keep reading keys contextual to the document surface

**Decision:** Map Space/PageDown and Shift+Space/PageUp to smooth 88%-viewport movement, and Home/End to first/last-page navigation, only while the event belongs to the PDF reading surface. Do not intercept controls, links, sidebar or translation-panel content, active text selections, modified chords, or key-repeat events.

**Reason:** Long documents benefit from predictable keyboard reading without requiring precise scrollbar or page-field interaction. A small viewport overlap preserves the reader's visual place, while contextual exclusions prevent the shortcuts from breaking buttons, inputs, links, or selectable text.

**Consequences:** Holding a navigation key does not auto-repeat, and Home/End open the first/last page at its start rather than scrolling to an arbitrary pixel at the extreme boundary. Chrome runtime behavior still needs the normal unpacked-extension manual pass.

### 2026-09-09 — Hand original bytes to Chrome for download and printing

**Decision:** Add toolbar actions plus Ctrl/Command+S and Ctrl/Command+P for the unchanged source PDF. Download uses the existing downloads API. Printing creates a short-lived Blob URL and first asks a hidden PDF frame to print; if Chrome denies or cannot load that frame, open the same Blob in the native PDF viewer at the current page. Do not rasterize the full document.

**Reason:** Saving the viewer page would produce HTML, while rendering every page for printing would be especially expensive for the 300-page books this extension targets. Reusing the retained original bytes preserves PDF text, vectors, forms, page sizes, and native print pagination.

**Consequences:** The native-viewer fallback needs one extra click on Chrome's print button, and both print paths require manual desktop Chrome verification. Blob URLs are revoked immediately after a completed dialog or after a bounded five-minute lifetime for the fallback tab.

### 2026-09-09 — Keep reading themes display-only and viewer-wide

**Decision:** Add Original, Sepia, and Dark choices through a palette popover and persist the choice in extension-page `localStorage`. Apply the selected filter only to main-viewer page canvases and their surround, not to thumbnail canvases, independent IMG/AI renders, PDF extraction, original download, or printing.

**Reason:** A dimmer page improves long reading sessions, but changing copied pages or AI inputs would make display preference silently alter downstream content and translation behavior. A single viewer-wide preference is more predictable than resetting the theme for every book.

**Consequences:** Dark mode uses a CSS inversion/hue-preservation filter that works best for text-heavy documents; photographs and unusually colored diagrams can look imperfect, so Original remains one click away. Theme persistence requires no Chrome `storage` permission and must still be visually checked in the unpacked extension.

### 2026-09-09 — Persist page bookmarks separately from saved PDFs

**Decision:** Add a pressed-state ribbon action for the current page and a fourth sidebar view that lists bookmarks sorted by page. Store each record in a separate IndexedDB database under the PDF fingerprint and page number. Derive a bounded title from the first meaningful embedded text item, with `Page N` fallback, and remove bookmark records when the saved PDF is removed.

**Reason:** Long books need a durable way to collect return points beyond one last-read position. Separate bookmark records keep the saved-document metadata lightweight, while local text extraction provides recognizable labels without AI, OCR, or network cost.

**Consequences:** Running headers can occasionally become bookmark titles and image-only pages have page-number labels. Bookmark storage and the toolbar/sidebar state need manual verification across document switches and Chrome restarts.

### 2026-09-10 — Keep bookmark annotations lightweight and schema-compatible

**Decision:** Let each bookmark title be edited inline and store one optional whitespace-normalized, 240-character plain-text note beside it. Add the fields directly to the schemaless IndexedDB records as optional values without changing the database version. Blank titles fall back to `Page N`, while blank notes are omitted.

**Reason:** Automatically extracted headers are useful starting points but are not always meaningful, and readers need a small local reminder without introducing a full annotation editor or sending page content to a network service.

**Consequences:** Notes are intentionally plain text and page-level rather than positioned on the PDF. Existing bookmark records continue to load unchanged; editor layout, keyboard focus, and persistence still require the unpacked-Chrome manual pass.

### 2026-09-10 — Track explicit page jumps, not continuous scroll

**Decision:** Add a bounded in-memory history for explicit jumps within the active PDF and expose previous/next view buttons plus Alt+Left/Right. Before another jump or history move, replace the location being left with the actual current page reached by scrolling. Reset the history on document changes and discard its forward branch after a new jump.

**Reason:** Readers often follow a contents entry, bookmark, search result, or cross-reference and need to return to where they were reading. Recording every page reported by continuous scrolling would create noisy, repetitive history that makes a back button impractical.

**Consequences:** History is page-level rather than an exact pixel offset and intentionally lasts only for the current viewer document session. Chrome runtime focus behavior and possible platform shortcut conflicts require manual unpacked-extension verification.

### 2026-09-10 — Treat fullscreen as an enhancement to focus mode

**Decision:** Add a temporary focus mode that hides the toolbar, sidebar, and translation panel without mutating their open states, then request browser fullscreen from the same user gesture. F toggles the mode, Escape exits it, and `fullscreenchange` restores the chrome when Chrome itself ends fullscreen. If the Fullscreen API rejects, keep the in-page focus state active and explain the fallback.

**Reason:** Reading benefits from a genuinely distraction-free canvas, but browser fullscreen availability depends on user activation and runtime policy. Separating the UI state from the browser request provides a reliable feature while still using the maximum screen area when permitted.

**Consequences:** Focus mode is intentionally session-only and does not persist. Fullscreen entry, Escape behavior, restored sidebar/panel state, and toolbar animation require manual verification in the unpacked extension.

### 2026-09-10 — Reuse page slots for a persisted page-turn flow

**Decision:** Add a viewer-wide continuous/paged preference in localStorage. In paged flow, hide every existing page slot except the current single page or cover-first spread and turn with edge buttons, Left/Right, or the existing Space/Page key family. Keep page turns out of explicit jump history and restore all slots when returning to continuous flow.

**Reason:** Focus mode benefits from an ebook-like presentation, but a second renderer or paginated document model would duplicate canvas, text, link, search, and current-page behavior. Reusing the bounded slots preserves one source of truth while providing discrete page navigation.

**Consequences:** Paged flow remembers its viewer-wide setting, while single/spread layout remains per-document and resets on document changes. Oversized pages still scroll inside the viewer, and page visibility, centering, edge controls, keyboard focus exclusions, and persistence require manual Chrome verification.

### 2026-09-10 — Collapse secondary toolbar actions into More

**Decision:** Keep zoom, fit, IMG/PDF/AI, and the current-page field directly visible. Move rotation, layout/flow, jump history, focus, theme, bookmark, search, original download, and print into one labeled three-column More panel with Escape and outside-click dismissal. Opening search from Ctrl/Command+F also opens the containing panel.

**Reason:** The complete feature set no longer fits comfortably in narrower viewer windows, while most secondary actions are changed occasionally or already have keyboard shortcuts. A stable compact toolbar preserves PDF space and keeps the primary page actions beside page state.

**Consequences:** Secondary actions require one additional click, and nested theme/search popovers plus the existing toolbar auto-hide animation require manual Chrome verification. Reading statistics remain out of scope because they add persistence and UI without helping the core page-preparation workflow.

### 2026-09-11 — Restore document-specific view state

**Decision:** Extend each saved-document metadata record with an optional validated view object containing manual/Fit zoom mode and scale, clockwise rotation, and single/spread layout. Save it with the existing debounced last-page update and restore it before constructing the new page renderer. Keep reading theme and continuous/page-turn flow viewer-wide.

**Reason:** Returning to a technical book should reproduce the useful reading setup as well as its page number. Optional metadata fields preserve all existing IndexedDB records without a schema migration, while remembering Fit intent allows a restored document to recalculate against the current viewport rather than blindly reusing an old pixel scale.

**Consequences:** Legacy or malformed view metadata falls back field-by-field to safe defaults. Manual zoom, Fit selection, rotation, and layout changes now update local document metadata; restored state and rapid document switching require manual Chrome verification.

### 2026-09-11 — Keep shortcut help inside More

**Decision:** Fill the final More-grid cell with a `? Shortcuts` action that opens an independent keyboard-reference panel. List only shortcuts implemented by the viewer or manifest, and dismiss the panel with its close button, Escape, or an outside pointer action.

**Reason:** The keyboard features have become difficult to discover, but another permanent toolbar button would undo the compact-toolbar work. Keeping discovery in More uses the existing empty grid cell and leaves primary page space unchanged.

**Consequences:** The reference is English-only for now and is a manually maintained reflection of actual bindings. Its positioning, focus return, compact-toolbar interaction, and platform labels require manual unpacked-Chrome verification.

### 2026-09-11 — Keep the sidebar's vertical origin stable

**Decision:** Always reserve one full toolbar height above the sidebar rail, tabs, and active panel, regardless of whether the top toolbar is compact or expanded. Limit the sidebar reveal animation to width and shadow.

**Reason:** Moving the sidebar content down only when the top bar expanded combined vertical and horizontal motion at the shared top-left hover corner, making the interface feel jumpy even though the overlays no longer obscured each other.

**Consequences:** The compact sidebar intentionally leaves a toolbar-height blank area at its top. Top-bar reveals no longer reflow or animate sidebar contents, while final spacing still requires manual Chrome visual verification.

### 2026-09-11 — Reveal the sidebar from the left edge

**Decision:** Remove the top-toolbar hamburger and persistent 48px sidebar rail. Make a 14px left-edge target below the toolbar reveal the complete overlay sidebar, then hide it after pointer and keyboard focus leave. Keep the sidebar revealed throughout saved-document drag reordering.

**Reason:** The hamburger duplicated the sidebar's hover behavior and occupied valuable toolbar space, while the always-visible rail continued to cover part of the reading surface. Matching the toolbar's edge-reveal model produces a cleaner resting viewer.

**Consequences:** Sidebar discovery now depends on the edge target and documentation. The invisible target remains keyboard-focusable, and hover timing, focus traversal, drag protection, and narrow-window animation require manual Chrome verification.

### 2026-09-11 — Fit locally detected page content

**Decision:** Add a third direct Fit action that shares PNG export's bounded low-resolution content measurement. Fit the padded detected box within both available viewport dimensions, retain the original full-page canvas/text/link coordinate space, and scroll that box to the viewport center. Cache measurements by page and view rotation for the current document; persist `fit-content` intent with the saved view.

**Reason:** Technical books often devote large areas to uniform paper margins, so fitting the physical page makes useful text unnecessarily small. Reusing deterministic local pixel analysis improves reading density without AI, OCR, network access, or altering the source PDF.

**Consequences:** Continuous flow applies Content Fit to the page selected when the action is invoked rather than changing zoom on every scroll boundary. Page-turn flow recalculates for each destination page and, after a short debounce, whenever the viewer border box changes. A frame boundary after page visibility changes ensures scale measurement uses settled layout. Colored, blank, unstable-border, or otherwise uncertain pages safely use their full bounds. Centering, mixed page sizes, spread layout, rotation, resize behavior, and saved-state restoration require manual Chrome verification.

### 2026-09-12 — Isolate and switch Gemini/OpenAI translation providers

**Decision:** Introduce a narrow current-page-image translation provider contract, ship `gemini-3.8-flash` and `gemini-3.1-flash-lite` with low thinking plus the existing `gpt-5.6-luna` OpenAI Responses implementation, and expose compact native provider and model dropdowns in the translation panel. Remember the selected model separately per provider for the tab, keep a separate in-memory key per provider, include provider/model identity in cache keys, and retain read compatibility with legacy OpenAI cache records. Default new viewer tabs to Gemini 3.8 Flash without persisting the selection.

**Reason:** The existing OpenAI translation was localized enough to separate before a second API made provider details spread through the viewer. A capability-specific boundary makes the two real implementations replaceable while keeping model selection to a small verified list instead of building an arbitrary LLM plugin system, free-form model picker, account store, or settings page.

**Consequences:** Switching providers or models never sends a request and loads a distinct cached translation for the active page. Both keys and per-provider model selections disappear when the tab closes. The panel names the actual destination instead of presenting a misleading generic AI key, while arbitrary model-ID entry remains out of scope.

### 2026-09-12 — Keep translation configuration out of the result flow

**Decision:** Move provider, model, and key controls into a gear popover. Present the active page as a fixed translation request with one long response surface and a bottom action, and retain API failures inline with retry and settings recovery actions. Map Gemini 503 high-demand responses to a short Korean recovery message.

**Reason:** Provider controls consumed the most prominent part of a panel whose primary job is reading translations, while toast-only failures disappeared before they could be inspected. A compact task-oriented conversation keeps the extension closer to the familiar AI reading flow without pretending to be a general chatbot.

**Consequences:** First use opens the gear popover because a key is required; later opens return directly to the result flow. Escape closes settings before the panel, outside clicks dismiss settings, and request errors remain visible until the user retries, changes page/provider/model, or supplies a replacement key. Popover placement, long-result scrolling, and bottom-action behavior require manual unpacked-Chrome verification.

### 2026-09-12 — Overlay the translation beside the source page

**Decision:** Remove Settings and Close from the translation header and place them beside the bottom Translate action. Make the panel an always-overlaying translucent surface below the top toolbar instead of a flex column that narrows the PDF viewport. Anchor the settings popover above the bottom controls and use darker local backplates plus subtle text shadows only around request/response content.

**Reason:** Header controls competed with the main toolbar and could be obscured. A translucent overlay preserves the full-size original underneath the translation, while localized contrast treatment keeps long Korean output readable without turning the whole panel opaque.

**Consequences:** Opening AI no longer changes Fit dimensions or shifts the PDF. The overlay intentionally intercepts interaction in its right-side footprint while open; Close remains reachable at the bottom. Transparency and contrast over white, dark, scanned, and illustrated pages require manual Chrome tuning.
