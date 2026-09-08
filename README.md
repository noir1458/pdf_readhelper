# PDF Read Helper

A private, local-first Chrome extension for reading, copying, extracting, and optionally translating PDF pages. PDF files stay local; an image of the current page is sent to OpenAI only when the user explicitly requests a translation.

## What it does

PDF Read Helper provides an extension-owned PDF.js reader. From the current page you can copy a clean PNG or extract an inclusive page range as a new PDF.

## Features

- Continuous PDF viewer with lazy nearby-page rendering
- Local PDF picker and drag-and-drop
- Public HTTP(S) and direct `file://` PDF loading where Chrome permits it
- Current-page detection, page navigation, zoom, fit-width, and fit-height
- Animated auto-compacting top toolbar that leaves page actions and the page counter fixed in place
- Collapsible left sidebar with lazy page thumbnails and PDF table-of-contents navigation
- Hover-expanding sidebar rail that overlays the document instead of reducing its width
- Local saved-document shelf with cover thumbnails, filenames, last-read pages, and persistent drag reordering
- Per-document page restoration across viewer and browser restarts
- Current PDF page rendered to PNG independently of browser UI and viewer zoom
- Local pixel-based margin detection, safe content cropping, and 70% output resampling
- PNG clipboard write with automatic download fallback
- Right-side Korean translation panel using the OpenAI Responses API
- Session-memory-only API key and local page translation cache
- Original PDF page-object extraction, such as `2-11.pdf`
- Keyboard shortcuts
- No remote code, analytics, persistent API-key storage, or backend

## Install

Requirements:

- Google Chrome
- Node.js 24 or newer
- npm

```bash
npm install
npm run build
```

## Development

```bash
npm run dev          # rebuild on file changes; reload the extension manually
npm run typecheck
npm run lint
npm run test
npm run build
npm run check        # all verification steps
npm run format
```

`dist/` is generated. Do not edit it directly.

## Load in Chrome

1. Run `npm install` and `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project's `dist` directory:
   `/Users/noir1458/git/pdf_readhelper/dist`
6. Pin **PDF Read Helper** to the toolbar.
7. After rebuilding, click **Reload** on the extension card.

## Usage

### Open a PDF

- Click the extension and choose **Open empty reader**, then use **Open PDF**.
- Drag a local PDF onto the reader.
- Click **Open URL** to reveal the compact URL form, then paste a public PDF URL.
- When the active tab URL ends in `.pdf`, click the extension and choose **Open current PDF**.

Authenticated, expiring, referrer-restricted, or special web viewers may not expose fetchable PDF bytes. Download those PDFs and open the local file instead.

### Navigate and fit pages

- The right control group is ordered as zoom out, zoom in, fit height, fit width, IMG, PDF, AI, and current/total page. Page actions and the page number therefore remain adjacent.
- Move away from the full top toolbar to compact it. IMG, PDF, AI, and the current/total page field remain translucently in their original toolbar positions while the other controls slide upward. Move into the 14px strip at the very top edge of the window to reveal the full toolbar again.
- Use the top-left menu button to show or hide the document sidebar. When enabled, it rests as a 48px icon rail and expands over the PDF while hovered or keyboard-focused.
- Switch the sidebar between page thumbnails and the PDF's embedded table of contents. PDFs without an outline show an empty state.
- Use the horizontal-arrow button to fit page width and the vertical-arrow button to fit the current page's height.

### Saved documents and reading position

- The third sidebar tab lists PDFs previously opened in the reader with a small cover, filename, and last-read page.
- Drag an entry by its grip to reorder the saved PDFs. The custom order persists across browser restarts.
- Select an entry to switch documents. The viewer restores that document to its last-read page.
- Use the entry's `×` button to remove the extension's saved copy. This does not delete the original file.
- PDFs and page positions are stored locally in the extension's IndexedDB and are never uploaded.

### Copy current page

1. Scroll until the intended page is current in the page counter.
2. Click **IMG / Copy** in the top toolbar.
3. Paste the PNG into another application with ⌘V.

The image comes from a new PDF.js render of the page. Before the final render, the extension analyzes a small local preview to find a stable neutral page background, computes the content bounds, and keeps safety padding around the result. Colored full-bleed pages, blank pages, and uncertain detections retain the full page. The cropped render is resampled to 70% before it is copied. This detection uses canvas pixels only—no AI, OCR, or network request.

Browser tabs, scrollbars, and extension controls are not captured. If the clipboard write fails, `page-N.png` is downloaded instead.

### Translate the current page

1. Click **AI / Translate** in the top toolbar.
2. Enter your own OpenAI API key. It remains only in this viewer tab's memory and is forgotten when the tab closes.
3. Click **Translate page**. The locally cropped/resampled current-page PNG is sent to `gpt-5.6-luna` with `detail: high` and `store: false`.
4. Read the Korean result in the right panel or copy it as text.

Opening the panel or scrolling never sends a request. Results are cached locally by PDF and page, so revisiting a translated page does not incur another request. **Translate again** makes a new billed request and replaces that page's cached result.

OpenAI's production guidance says API keys should not be exposed in browsers or apps. This direct session-only flow is intended solely for the owner's private unpacked extension. Do not use it in a distributed build; introduce a server-side proxy or short-lived credential flow first. Use a dedicated project key with an appropriate spending limit.

### Extract `2-11.pdf`

1. Click **PDF / Range**.
2. Enter `2-11` and press Enter.
3. The extension copies those original page objects and downloads `2-11.pdf`.

Close the range popover with its `×` button, `Esc`, or a click anywhere outside it.

A single page such as `7` downloads as `7.pdf`. The operation preserves normal text, vector graphics, images, layout, and page dimensions; it does not combine screenshots.

## Keyboard shortcuts

- **⌘C** on macOS / **Ctrl+C** elsewhere while viewing the PDF: copy the current page as an image, matching the IMG button. Normal copy is preserved in inputs and when text is selected.
- **⌘⇧C** on macOS / **Ctrl+Shift+C** elsewhere: copy current page

The plain copy shortcut works inside the viewer. The Shift variant is the extension-wide manifest command and can be changed at `chrome://extensions/shortcuts`; Chrome may reserve or conflict with suggested bindings.

## Local PDFs

The local file picker and drag-and-drop are the most reliable options and need no filesystem permission beyond the file you choose.

For direct `file://` URL handoff:

1. Open `chrome://extensions`.
2. Open PDF Read Helper **Details**.
3. Enable **Allow access to file URLs**.
4. Retry the URL.

Chrome controls this setting; the extension cannot enable it automatically.

## Architecture summary

- Manifest V3 extension
- Strict TypeScript with Vite
- Vanilla DOM UI
- `pdfjs-dist` with a local extension-bundled worker, CMaps, fonts, WASM, and ICC data
- `@cantoo/pdf-lib` for original page copying
- Viewer-owned PDF bytes and state
- IndexedDB-backed saved-document metadata, PDF bytes, cover thumbnail, and last-read page
- Separate IndexedDB translation cache containing returned text and token counts, never API keys or page images
- Direct Responses API client for explicitly requested current-page translation
- Service worker limited to keyboard-command routing
- Typed message contracts in `src/shared/messages.ts`
- Lazy rendering with bounded canvas release

For complete architecture, security policy, decisions, and current status, see [AGENT.md](AGENT.md).

## Permissions

- `activeTab`: inspect the tab the user explicitly invokes the extension on
- `tabs`: inspect/open viewer tabs and route keyboard commands
- `downloads`: save extracted PDFs and fallback PNGs
- `commands`: keyboard shortcuts
- `clipboardWrite`: write PNG after asynchronous page rendering
- `http://*/*`, `https://*/*`, `file:///*`: fetch a user-chosen PDF URL and call `api.openai.com` after an explicit translation request

There are no always-on content scripts and no passive browsing collection.

## Privacy

- PDF processing happens in the browser.
- Original PDF bytes are not uploaded. A prepared image of one page is uploaded to OpenAI only when Translate is clicked.
- Saved PDF copies and reading positions stay in the extension's local IndexedDB.
- Returned translations and token counts stay in a separate local IndexedDB cache.
- No analytics or telemetry.
- The OpenAI API key stays only in the current viewer tab's memory and is not persisted.

## Known limitations

- Chrome's built-in PDF viewer is not modified; PDFs open in the extension's reader.
- Public PDF fetch can fail due to CORS, authentication, session, or anti-hotlink rules.
- `file://` access requires the manual Chrome setting above.
- Selectable text and annotation/link layers are not included in the first stable MVP.
- Encrypted PDFs are not supported. Signed, malformed, form-heavy, or unusual annotated PDFs may not extract perfectly.
- PDF bookmarks/outlines and signatures are not guaranteed to survive range extraction.
- Browser memory still limits extremely large documents/pages despite lazy rendering and pixel caps.
- Saving many very large PDFs can exhaust Chrome's storage quota; remove unneeded entries from the saved-documents tab.
- OpenAI translation requires a billed API key and an internet connection. Closing the viewer forgets the key.
- Direct API-key use is suitable only for this private unpacked copy, not a publicly distributed extension.

## Manual verification checklist

Automated checks cannot prove browser-only APIs. After loading `dist`, verify:

- [ ] Open a normal local PDF with the file picker
- [ ] Drag and drop a local PDF
- [ ] Scroll through a 10+ page document and confirm the page counter follows
- [ ] Open a 100+ page document and inspect that distant canvases are released
- [ ] Switch between thumbnails and table of contents; navigate with both
- [ ] Switch between two saved PDFs, drag them into a new order, and verify the cover/title list, persistent order, and restored page
- [ ] Reload Chrome and verify that saved documents and last-read pages remain available
- [ ] Close the range popover using `×`, `Esc`, and an outside click
- [ ] Open and close the URL popover using its button, `×`, `Esc`, and an outside click
- [ ] Zoom, fit width, and fit height
- [ ] Move away from the toolbar, verify compact mode, then touch the top edge to reveal all controls; confirm the expanded toolbar pushes sidebar content below it
- [ ] Verify the left sidebar collapses to its icon rail and expands over—not beside—the PDF
- [ ] Copy a page, paste into another application, and confirm only the PDF page appears
- [ ] Confirm normal white-page margins are cropped without cutting headers, footers, or page numbers
- [ ] Confirm colored covers, blank pages, scanned pages, and dark pages use safe bounds
- [ ] Open and close the translation panel and confirm that scrolling alone does not send requests
- [ ] Translate one page with a low-limit test API key and verify Korean output and token counts
- [ ] Revisit that page and confirm its cached translation loads without another request
- [ ] Use **Translate again**, **Copy translation**, **Change key**, Escape, and the panel close button
- [ ] Trigger a denied clipboard and confirm PNG fallback download
- [ ] Extract `2-11` and confirm exactly ten vector/text pages
- [ ] Open a public PDF URL from the on-demand URL popover
- [ ] Enable file URL access and test a direct `file://` PDF
- [ ] Test and remap the copy-page keyboard shortcut
- [ ] Check the extension/service-worker console for worker or CSP errors

## Troubleshooting

### Extension does not appear

Run `npm run build`, load the `dist` directory rather than the source root, and pin the extension. After each build, use **Reload** on `chrome://extensions`.

### URL PDF fails to open

The server may require a logged-in request, block cross-origin fetches, redirect to HTML, or use a temporary URL. Download the PDF and open it locally. The extension does not bypass authentication.

### Clipboard fails

Keep the reader tab focused and click IMG again. Chrome may deny clipboard access due to browser/OS policy. The extension should download `page-N.png` as a fallback.

### Translation fails

Confirm the API key belongs to an active OpenAI project with available billing/spend limit, then try again. A 401 message indicates a rejected key; a 429 message usually indicates a rate or spending limit. Closing the viewer tab clears the key, so enter it again after reopening.

### Local file cannot open

Use the reader's file picker or drag-and-drop. For a direct `file://` URL, enable **Allow access to file URLs** in the extension details.

### Shortcut conflicts

Open `chrome://extensions/shortcuts`, assign a different key, and keep the PDF Read Helper viewer active when using it.
