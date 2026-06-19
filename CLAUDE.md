# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome Extension (Manifest V3) that audits Webflow sites for SEO, Performance, Mobile, and Accessibility issues. It is an internal team tool — not published on the Chrome Web Store.

## Development workflow

**Load the extension** in Chrome:
1. Go to `chrome://extensions/`
2. Enable Developer Mode
3. Click "Cargar descomprimida" → select this repo's root folder

**Reload after changes**: Click the ↺ reload button on `chrome://extensions/` after editing any file. Popup changes take effect on next popup open; `content.js` changes require reloading the target page too.

**No build step is needed for development.** There is no npm, no bundler, no test runner.

**Release a new version:**
```bash
./build.sh
```
The script prompts for patch/minor/major/custom, bumps `manifest.json`, creates a versioned `.zip` (and `.crx` if Chrome is on PATH) in `docs/downloads/`, and updates `docs/update.xml` and `docs/index.html`.

After running the script:
```bash
git add -A
git commit -m "release: v1.x.x"
git tag v1.x.x
git push && git push --tags
```

## Architecture

There is no background service worker. The extension is purely reactive: popup ↔ content script messaging.

### `content.js` — runs inside the audited page

Wrapped in a `window.WFAuditorLoaded` guard to prevent errors when injected multiple times into the same page.

The `WFAuditor` object exposes:
- `run(customDoc?, customUrl?)` — executes all four audits and returns `{ url, title, timestamp, categories: { seo, performance, mobile, accessibility } }`. Each category is an array of **check objects**.
- `registerElementError(el, additionalProps)` — stamps a `data-wfa-id` attribute (deterministic hash of CSS selector) on the element, used later by `locateElement` to find it even after re-renders. Returns `{ wfaId, selector, html, ...additionalProps }`.
- `getUniqueSelector(el)` — builds a path of `tag:nth-of-type(n)` segments up to the first ancestor with an `id`.

**Check object shape:**
```js
{
  id: 'string',          // stable identifier
  name: 'string',        // display label
  status: 'pass' | 'warn' | 'fail' | 'info',
  detail: 'string',      // summary shown in collapsed state
  errors: [...],         // array of registerElementError() results (optional)
  map: [...],            // heading map strings (only on heading checks)
  fix: 'string | null'   // Webflow-specific fix instructions
}
```

**Message listeners** (`chrome.runtime.onMessage`):
- `runAudit` → calls `WFAuditor.run()`, returns `{ success, data }`.
- `locateElement` → finds element by `data-wfa-id` (or CSS selector fallback), scrolls to it, overlays an animated highlight box + toast. If no `data-wfa-id` elements exist yet it auto-runs an audit to stamp them first.
- `removeHighlight` → removes the highlight box and toast.

### `popup.js` + `popup.html` — the extension popup UI

Two tabs: **Página Actual** (single-page audit) and **Sitemap** (batch audit).

**Single-page flow:**
1. `runSingleAudit()` sends `{ action: 'runAudit' }` to the active tab via `chrome.tabs.sendMessage`.
2. `renderResults(data, summaryId, resultsId)` renders score circles and collapsible check items.
3. Results are persisted to `chrome.storage.local` keyed by URL so they survive popup close.

**Sitemap flow:**
1. Fetches and parses the sitemap XML, filters to same-domain HTML URLs.
2. `auditNextSitemapUrl()` creates a background tab per URL (`active: false`), injects `content.js`, sends `runAudit`, collects the response, then closes the tab and moves to the next. 15-second safety timeout per tab.
3. Aggregated results are persisted under `chrome.storage.local` key `"sitemap_audit_data"`.

**Element location toggle** in `popup.js`:
- `activeLocateKey` / `activeLocateBtn` track which "📍 Localizar" button is currently active.
- Clicking the same button again sends `removeHighlight` and resets state.
- If the audit was run on a different URL than the current tab, `popup.js` navigates the tab to that URL first, waits for `tabs.onUpdated` status `"complete"`, then re-injects `content.js` before sending `locateElement`.

### `styles.css`

All popup styles. Score circles use a CSS custom property `--percentage` (set via JS `style.setProperty`) with `conic-gradient` to render the arc. Color classes are `score-good` (≥80%), `score-warn` (≥50%), `score-bad` (<50%).

### `docs/`

GitHub Pages site used for distribution:
- `index.html` — landing page with download links (version string updated by `build.sh`).
- `update.xml` — Chrome's auto-update manifest, pointing to `webflow-auditor-latest.crx`.
- `downloads/` — built ZIPs and CRXs.

### `.keys/extension.pem` (gitignored)

The private key generated the first time `build.sh` runs Chrome's `--pack-extension`. Required to re-sign CRX files with the same extension ID. Back it up externally.

## Audit coverage

| Category      | Checks | Key items |
|---------------|--------|-----------|
| SEO           | 10     | Title, Meta desc, H1 uniqueness, Heading order, Image alt, SSL, URL underscores, Lang, iFrame titles |
| Performance   | 8      | DOM size, Viewport, Render-blocking scripts, `document.write`, CLS, Animated GIFs, Cache info |
| Mobile        | 5      | Viewport, Flash, Tap targets ≥44px, Font size ≥12px, Horizontal scroll |
| Accessibility | 16     | Button/link names, Heading order, Image alt, Lang validity, Duplicate IDs, Form labels, Tabindex, aria-hidden with focusable children, Skip links, Meta refresh, Video captions, Object alt, ARIA required children, Valid ARIA roles, List item containment, Unique accesskeys |
