# PDF Read Helper

A private, local-first Chrome extension for reading, copying, and extracting PDF pages. It does not call an LLM API or upload PDF data to a server.

## What it does

PDF Read Helper provides an extension-owned PDF.js reader. From the current page you can copy a clean PNG or extract an inclusive page range as a new PDF.

## Features

- Continuous PDF viewer with lazy nearby-page rendering
- Local PDF picker and drag-and-drop
- Public HTTP(S) and direct `file://` PDF loading where Chrome permits it
- Current-page detection, page navigation, zoom, fit-width, and fit-height
- Collapsible left sidebar with lazy page thumbnails and PDF table-of-contents navigation
- Local saved-document shelf with cover thumbnails, filenames, and last-read pages
- Per-document page restoration across viewer and browser restarts
- Current PDF page rendered to PNG independently of browser UI and viewer zoom
- Local pixel-based margin detection, safe content cropping, and 70% output resampling
- PNG clipboard write with automatic download fallback
- Original PDF page-object extraction, such as `2-11.pdf`
- Keyboard shortcuts
- No remote code, analytics, API keys, or backend

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
- Paste a public PDF URL into the reader.
- When the active tab URL ends in `.pdf`, click the extension and choose **Open current PDF**.

Authenticated, expiring, referrer-restricted, or special web viewers may not expose fetchable PDF bytes. Download those PDFs and open the local file instead.

### Navigate and fit pages

- Use the top-left menu button to show or hide the document sidebar.
- Switch the sidebar between page thumbnails and the PDF's embedded table of contents. PDFs without an outline show an empty state.
- Use the horizontal-arrow button to fit page width and the vertical-arrow button to fit the current page's height.

### Saved documents and reading position

- The third sidebar tab lists PDFs previously opened in the reader with a small cover, filename, and last-read page.
- Select an entry to switch documents. The viewer restores that document to its last-read page.
- Use the entry's `×` button to remove the extension's saved copy. This does not delete the original file.
- PDFs and page positions are stored locally in the extension's IndexedDB and are never uploaded.

### Copy current page

1. Scroll until the intended page is current in the page counter.
2. Click **IMG / Copy** in the top toolbar.
3. Paste the PNG into another application with ⌘V.

The image comes from a new PDF.js render of the page. Before the final render, the extension analyzes a small local preview to find a stable neutral page background, computes the content bounds, and keeps safety padding around the result. Colored full-bleed pages, blank pages, and uncertain detections retain the full page. The cropped render is resampled to 70% before it is copied. This detection uses canvas pixels only—no AI, OCR, or network request.

Browser tabs, scrollbars, and extension controls are not captured. If the clipboard write fails, `page-N.png` is downloaded instead.

### Extract `2-11.pdf`

1. Click **PDF / Range**.
2. Enter `2-11` and press Enter.
3. The extension copies those original page objects and downloads `2-11.pdf`.

Close the range popover with its `×` button, `Esc`, or a click anywhere outside it.

A single page such as `7` downloads as `7.pdf`. The operation preserves normal text, vector graphics, images, layout, and page dimensions; it does not combine screenshots.

## Keyboard shortcuts

- **⌘⇧C** on macOS / **Ctrl+Shift+C** elsewhere: copy current page

Commands work while the PDF Read Helper viewer tab is active. Chrome may reserve or conflict with a suggested shortcut. Review or change bindings at `chrome://extensions/shortcuts`.

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
- `http://*/*`, `https://*/*`, `file:///*`: fetch a PDF URL chosen by the user, wherever it is hosted

There are no always-on content scripts and no passive browsing collection.

## Privacy

- PDF processing happens in the browser.
- PDF data is not uploaded by this extension.
- Saved PDF copies and reading positions stay in the extension's local IndexedDB.
- No analytics or telemetry.
- No API key or account storage.

## Known limitations

- Chrome's built-in PDF viewer is not modified; PDFs open in the extension's reader.
- Public PDF fetch can fail due to CORS, authentication, session, or anti-hotlink rules.
- `file://` access requires the manual Chrome setting above.
- Selectable text and annotation/link layers are not included in the first stable MVP.
- Encrypted PDFs are not supported. Signed, malformed, form-heavy, or unusual annotated PDFs may not extract perfectly.
- PDF bookmarks/outlines and signatures are not guaranteed to survive range extraction.
- Browser memory still limits extremely large documents/pages despite lazy rendering and pixel caps.
- Saving many very large PDFs can exhaust Chrome's storage quota; remove unneeded entries from the saved-documents tab.

## Manual verification checklist

Automated checks cannot prove browser-only APIs. After loading `dist`, verify:

- [ ] Open a normal local PDF with the file picker
- [ ] Drag and drop a local PDF
- [ ] Scroll through a 10+ page document and confirm the page counter follows
- [ ] Open a 100+ page document and inspect that distant canvases are released
- [ ] Switch between thumbnails and table of contents; navigate with both
- [ ] Switch between two saved PDFs and verify the cover/title list and restored page
- [ ] Reload Chrome and verify that saved documents and last-read pages remain available
- [ ] Close the range popover using `×`, `Esc`, and an outside click
- [ ] Zoom, fit width, and fit height
- [ ] Copy a page, paste into another application, and confirm only the PDF page appears
- [ ] Confirm normal white-page margins are cropped without cutting headers, footers, or page numbers
- [ ] Confirm colored covers, blank pages, scanned pages, and dark pages use safe bounds
- [ ] Trigger a denied clipboard and confirm PNG fallback download
- [ ] Extract `2-11` and confirm exactly ten vector/text pages
- [ ] Open a public PDF URL
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

### Local file cannot open

Use the reader's file picker or drag-and-drop. For a direct `file://` URL, enable **Allow access to file URLs** in the extension details.

### Shortcut conflicts

Open `chrome://extensions/shortcuts`, assign a different key, and keep the PDF Read Helper viewer active when using it.
