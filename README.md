# PDF Read Helper

A private, local-first Chrome extension for reading, copying, extracting, and optionally translating PDF pages. PDF files stay local; an image of the current page is sent to OpenAI only when the user explicitly requests a translation.

## What it does

PDF Read Helper provides an extension-owned PDF.js reader. From the current page you can copy a clean PNG or extract an inclusive page range as a new PDF.

## Features

- Continuous PDF viewer with lazy nearby-page rendering
- Local PDF picker and drag-and-drop
- Public HTTP(S) and direct `file://` PDF loading where Chrome permits it
- Current-page detection, page navigation history, zoom, fit-width, and fit-height
- Clockwise page rotation shared by the viewer, IMG copy, and AI translation capture
- Continuous single-column and book-style two-page spread layouts
- Persistent Original, Sepia, and Dark reading themes that affect display only
- Selectable PDF text with native copy behavior
- Full-document Ctrl/Command+F search with exact highlights and previous/next navigation
- Reading navigation with Space/PageDown, Shift+Space/PageUp, and Home/End
- Persistent continuous-scroll or page-turn reading flow with single-page and spread support
- Clickable PDF links with internal-page navigation and safe external-tab opening
- Original PDF download and print handoff without rerendering every page
- Animated auto-compacting top toolbar that leaves page actions and the page counter fixed in place
- Focus/fullscreen reading mode that temporarily hides all viewer chrome
- Collapsible left sidebar with lazy page thumbnails and PDF table-of-contents navigation
- Hover-expanding sidebar rail that overlays the document instead of reducing its width
- Local saved-document shelf with covers, last-read pages, per-document view state, and persistent drag reordering
- Per-document page restoration across viewer and browser restarts
- Persistent per-PDF page bookmarks with editable local titles, short notes, and sidebar navigation
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

- The compact right control group keeps zoom out, zoom in, fit height, fit width, More, IMG, PDF, AI, and current/total page directly adjacent. More opens a labeled grid containing rotation, page layout/flow, previous/next view, focus mode, reading theme, bookmark, search, original download/print, and a keyboard-shortcut reference, so narrow windows do not overflow with one button per feature.
- Move away from the full top toolbar to compact it. IMG, PDF, AI, and the current/total page field remain translucently in their original toolbar positions while the other controls slide upward. Move into the 14px strip at the very top edge of the window to reveal the full toolbar again.
- Use the top-left menu button to show or hide the document sidebar. When enabled, it rests as a 48px icon rail and expands over the PDF while hovered or keyboard-focused.
- Switch the sidebar between page thumbnails and the PDF's embedded table of contents. PDFs without an outline show an empty state.
- Use the horizontal-arrow button to fit page width and the vertical-arrow button to fit the current page's height.
- Use the three-dot **More** button for less frequent view, navigation, theme, bookmark, search, download, print, and shortcut-help controls. Choose **? Shortcuts** for an in-viewer reference of every supported key. The panels close with their × button, Escape, or a click elsewhere. Ctrl/Command+F opens More and its search field automatically.
- Use the curved-arrow button to rotate the document clockwise in 90° steps. Text selection, search highlights, links, IMG copy, and new AI translation requests follow the displayed rotation. Extracted PDF ranges retain their original page orientation.
- Use the two-sheet button to switch between a continuous single-page column and a two-page spread. In spread mode page 1 is centered alone as the cover, followed by 2–3, 4–5, and so on. Clicking either page makes it the current IMG/AI/PDF target.
- Use the page-and-arrow button to switch between continuous scrolling and page-turn mode. Page-turn mode shows only the current page or cover-first spread, adds translucent previous/next buttons at the viewer edges, and supports Left/Right Arrow, Space, Shift+Space, Page Up, and Page Down. The selected flow persists locally across viewer tabs and browser restarts.
- Use the left/right arrows to return through explicit page jumps made by thumbnails, the outline, bookmarks, search, PDF links, the page field, or Home/End. Ordinary scrolling is not added page by page; the actual page reached before the next jump becomes the return point. A new jump after going back clears the old forward branch, and opening another PDF resets the history.
- Use the four-corner button or press **F** to enter focus mode. It requests browser fullscreen and temporarily hides the toolbar, sidebar, and translation panel without closing them. Press **F** or **Escape** to restore the previous layout. If Chrome refuses fullscreen, the distraction-free viewer mode still works.
- Use the palette button to choose Original, Sepia, or Dark. The preference persists locally across viewer tabs. It changes only the visible page canvases and reading surround; thumbnails, copied PNGs, AI input, downloaded PDFs, and printing retain original colors.
- Click links inside a PDF to follow internal page destinations. Web and email links open outside the viewer in a new tab; unsupported embedded actions and PDF JavaScript are ignored.

### Download or print the original PDF

- Use **More → Download** or ⌘S/Ctrl+S to save the unchanged source PDF with a safe filename.
- Use **More → Print** or ⌘P/Ctrl+P to print the unchanged source PDF. The extension first asks Chrome's PDF frame to open its print dialog. If Chrome blocks framed PDF printing, it opens the original PDF in the native viewer so its print button can be used.

Both actions reuse the already loaded bytes. They do not render hundreds of page canvases, apply the viewer's rotation, or alter the source file.

### Saved documents and reading position

- The third sidebar tab lists PDFs previously opened in the reader with a small cover, filename, and last-read page.
- Drag an entry by its grip to reorder the saved PDFs. The custom order persists across browser restarts.
- Select an entry to switch documents. The viewer restores its last-read page, manual zoom or Fit mode, rotation, and single/spread layout.
- Use the entry's `×` button to remove the extension's saved copy. This does not delete the original file.
- PDFs, page positions, and document view settings are stored locally in the extension's IndexedDB and are never uploaded.

### Page bookmarks

- Click the ribbon button to add or remove a bookmark for the current page. Its pressed state shows whether the page is bookmarked.
- Open the fourth sidebar tab to see the current PDF's bookmarks, sorted by page number. Select one to navigate, use `✎` to edit its title or add a short note, or use `×` to remove it. Enter saves the inline editor; Escape or Cancel closes it without changes.
- A short title is taken locally from the page's first meaningful embedded text. Textless/scanned pages use `Page N`; no AI or network request is involved.
- Bookmark titles and notes persist locally by PDF fingerprint. Removing a PDF from the saved-document shelf also removes its local bookmarks.

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

- **⌘F** on macOS / **Ctrl+F** elsewhere: search all text-bearing pages in the current PDF. Enter moves forward and Shift+Enter moves backward.
- **⌘C** on macOS / **Ctrl+C** elsewhere while viewing the PDF: copy the current page as an image, matching the IMG button. Normal copy is preserved in inputs and when text is selected.
- **⌘⇧C** on macOS / **Ctrl+Shift+C** elsewhere: copy current page
- **⌘S** on macOS / **Ctrl+S** elsewhere: download the unchanged original PDF.
- **⌘P** on macOS / **Ctrl+P** elsewhere: print the unchanged original PDF, with native-viewer fallback.
- **Space** or **Page Down**: move forward by most of one viewport, retaining a small reading overlap.
- **Shift+Space** or **Page Up**: move backward by most of one viewport.
- **Home** / **End**: move to the first / last page.
- **Alt+Left Arrow** / **Alt+Right Arrow**: move to the previous / next page-jump location. Inputs retain their native arrow behavior.
- **F**: enter or exit focus/fullscreen reading mode. **Escape** also exits while focus mode is active.
- **Left Arrow** / **Right Arrow**: turn the previous / next page or spread while page-turn mode is active.

Reading shortcuts apply to the PDF area only. In page-turn mode, Space/Page Down and Shift+Space/Page Up turn pages instead of scrolling the viewport. Native behavior is preserved in toolbar controls, sidebar and translation content, links, inputs, and while text is selected. The plain copy shortcut works inside the viewer. The Shift copy variant is the extension-wide manifest command and can be changed at `chrome://extensions/shortcuts`; Chrome may reserve or conflict with suggested bindings.

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
- IndexedDB-backed saved-document metadata, PDF bytes, cover thumbnail, last-read page, and view state
- LocalStorage-backed reading theme and continuous/page-turn flow preferences
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
- Scanned/image-only pages have no selectable or searchable text unless the PDF itself contains an OCR text layer.
- Form fields, annotation editing/popups, attachments, and embedded PDF JavaScript are not enabled. The overlay handles links only.
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
- [ ] Switch between two saved PDFs, drag them into a new order, and verify persistent order plus restored page, zoom/Fit mode, rotation, and single/spread layout
- [ ] Bookmark text and scanned pages, edit a title/note with Enter and cancel with Escape, switch PDFs/reload Chrome, and verify navigation, pressed state, persistence, and removal
- [ ] Jump with thumbnails, outline, bookmarks, search, PDF links, page input, and Home/End; verify previous/next view buttons and Alt+Left/Right follow history, capture the page reached by scrolling, clear the forward branch after a new jump, and reset for another PDF
- [ ] Enter focus mode with its toolbar button and F; verify browser fullscreen plus hidden toolbar/sidebar/translation panel, then exit with F and Escape and confirm the previous layout returns
- [ ] Reload Chrome and verify that saved documents, last-read pages, and per-document view settings remain available
- [ ] Close the range popover using `×`, `Esc`, and an outside click
- [ ] Open and close the URL popover using its button, `×`, `Esc`, and an outside click
- [ ] Zoom, fit width, and fit height
- [ ] Open More, use a direct action, Escape, and outside click; verify it closes correctly and that theme/search sub-popovers remain usable
- [ ] Open More → Shortcuts; verify the reference remains visible after More closes and closes with ×, Escape, and an outside click
- [ ] Rotate through 90°, 180°, 270°, and 0°; verify canvas, text selection, search highlights, and links remain aligned
- [ ] Copy and explicitly retranslate a rotated page; verify the generated image follows the displayed orientation while PDF Range remains original
- [ ] Toggle the two-page spread; verify page 1 is alone, later pages pair correctly, fit-width fits each sheet, and clicking the right sheet updates the page counter
- [ ] Toggle page-turn mode in single and spread layouts; verify edge buttons, Left/Right, Space/Page Down, Shift+Space/Page Up, first/last boundaries, continuous-mode restoration, and persistence after reload
- [ ] Switch among Original, Sepia, and Dark; reload the viewer to confirm persistence and verify IMG/AI/PDF/print outputs keep original colors
- [ ] Use Space/PageDown, Shift+Space/PageUp, and Home/End over the PDF; confirm inputs, buttons, links, sidebar/translation content, and active text selections keep their native behavior
- [ ] Select PDF text, press ⌘C/Ctrl+C, and confirm native text—not a page PNG—is copied
- [ ] Open search with ⌘F/Ctrl+F, find a phrase across the full document, and navigate forward/backward with Enter/Shift+Enter and the arrow buttons
- [ ] Click an internal page link and an external web link; confirm the former navigates in the viewer and the latter opens a new tab
- [ ] Download the original PDF with the toolbar and ⌘S/Ctrl+S; confirm its bytes/pages are unchanged and its filename is safe
- [ ] Print with the toolbar and ⌘P/Ctrl+P; confirm either the PDF print dialog opens or the native PDF viewer opens at the current page as a fallback
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
