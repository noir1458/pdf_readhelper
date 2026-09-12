# Browser verification

Run the automated checks first:

```bash
npm run check
```

Browser APIs, extension permissions, rendering, clipboard behavior, and provider requests still require manual verification after loading `dist/` as an unpacked extension.

## Documents and navigation

- [ ] Open a normal local PDF with the file picker and by drag-and-drop.
- [ ] Open a public PDF URL and a permitted direct `file://` URL.
- [ ] Scroll through a 10+ page document and confirm the page counter follows.
- [ ] Open a 100+ page document and confirm distant canvases are released.
- [ ] Navigate with thumbnails, outline, bookmarks, search, PDF links, page input, and Home/End.
- [ ] Confirm back/forward page history follows explicit jumps, records the page reached after scrolling, clears a forward branch after a new jump, and resets for another PDF.
- [ ] Confirm internal links navigate in the reader and external web links open in a new tab.
- [ ] Verify selectable PDF text, native text copy, document search, highlights, and previous/next results.

## Reader layout

- [ ] Test zoom, Fit Width, Fit Height, and Content Fit on text-heavy, colored, blank, scanned, rotated, and mixed-size pages.
- [ ] Rotate through 90°, 180°, 270°, and 0° and verify canvas, text, search highlights, and links remain aligned.
- [ ] Toggle spread mode and verify page 1 is alone, later pages pair correctly, and the page indicator shows values such as `2, 3`.
- [ ] Toggle page-turn mode in single and spread layouts and test edge buttons plus supported navigation keys.
- [ ] Switch Original, Sepia, and Dark themes, reload, and confirm copied, translated, downloaded, and printed output keeps original colors.
- [ ] Enter and exit focus mode with the toolbar, <kbd>F</kbd>, and <kbd>Escape</kbd>; confirm the previous layout returns.
- [ ] Verify the top toolbar and left sidebar reveal correctly without shifting the document.

## Local library and bookmarks

- [ ] Switch between saved PDFs, reorder them, and reload Chrome.
- [ ] Confirm last page, zoom or Fit mode, rotation, and layout restore per document.
- [ ] Remove a saved copy and confirm the original file is untouched.
- [ ] Bookmark text and scanned pages, edit titles and notes, navigate from the sidebar, reload, and remove bookmarks.

## Copy, extract, download, and print

- [ ] Copy a page and confirm only the PDF page appears in the pasted PNG.
- [ ] Confirm ordinary margins are cropped without removing headers, footers, or page numbers.
- [ ] Confirm colored covers, blank pages, dark pages, and uncertain bounds retain safe margins.
- [ ] Rotate a page and confirm copied output follows the displayed rotation.
- [ ] Deny clipboard access and confirm the PNG download fallback.
- [ ] Extract `2-11` and confirm exactly ten original vector/text pages.
- [ ] Download and print the source PDF and confirm it remains unchanged.

## AI translation

- [ ] Open and close the panel with the button and <kbd>T</kbd>; translate with the action and <kbd>Shift</kbd> + <kbd>T</kbd>.
- [ ] Confirm typing fields, controls, selected text, and focus mode retain native keyboard behavior.
- [ ] Confirm page changes do not create requests while AUTO is off.
- [ ] Configure every provider/model option, follow each official key link, replace/delete keys, and test suggested plus custom target languages.
- [ ] Translate one page with each provider and verify language output, creation metadata, and token counts.
- [ ] In spread mode, verify both requests run independently and results appear in page order with a divider.
- [ ] Change provider, model, or language and confirm an existing cached page remains until explicitly retranslated.
- [ ] Confirm retranslating replaces the page's single latest cache entry.
- [ ] Export a partially translated PDF and confirm cached pages are ordered and gaps are omitted.
- [ ] Delete the current PDF's translation cache and confirm other PDFs are unaffected.
- [ ] Cycle all opacity, panel-width, and font-size states; confirm the opaque state fully hides the PDF below it.
- [ ] Enable AUTO, inspect its cost warning, move rapidly across pages, and confirm only the settled uncached page is requested after the delay.
- [ ] Test Copy translation, Retry, Check settings, Escape, and panel close.
- [ ] Trigger a provider failure and confirm the complete error stays in the result panel.

## Final checks

- [ ] Test all keyboard shortcuts and remap the extension command at `chrome://extensions/shortcuts`.
- [ ] Check the extension, viewer, and service-worker consoles for errors or CSP warnings.
- [ ] Confirm no API keys or secret-like test fixtures are present in tracked files or commit-bound changes.
