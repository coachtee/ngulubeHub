# Ngulube Hub documentation

This directory holds the documentation for the Ngulube Hub application.

## Files

| File | Purpose | Format |
|---|---|---|
| [`USER_MANUAL.md`](USER_MANUAL.md) | Canonical user manual — the source of truth | Markdown |
| [`manual.html`](manual.html) | Rendered, printable, illustrated version of the manual | Standalone HTML (no external CSS/JS) |
| `manual-assets/` | Screenshots and illustrations embedded in the manual | PNG images |

## Updating the manual

The Markdown file (`USER_MANUAL.md`) is the source of truth. The HTML file (`manual.html`) is a parallel render that should be kept in sync.

### Workflow

1. **Edit the Markdown.** All content lives in `USER_MANUAL.md`. The file is structured to mirror the HTML output, with the same section numbering and roughly the same screenshots.

2. **Mirror the changes into the HTML.** Open both side by side and update the HTML to match. The HTML has:
   - A sidebar table of contents (auto-linked by section IDs)
   - Embedded screenshots via `<img src="manual-assets/...">` (relative paths)
   - Inline CSS (no external dependencies — the HTML is self-contained)
   - Print-friendly styles (try `Cmd+P` to see the print preview)
   - Mobile-friendly responsive layout

3. **Update screenshots if needed.** New screenshots go in `manual-assets/`. Use the existing naming convention: `NN-descriptive-name.png`. Curate — one good screenshot per concept, not ten mediocre ones.

4. **Commit both files together** with a message like `docs: update manual for {feature}`. The HTML is treated as a build artifact but lives in the repo for easy sharing.

## Reading the manual

- **Web:** open `docs/manual.html` in a browser. Sidebar nav, embedded images, no internet required.
- **Print:** use the browser's "Print to PDF" — print styles are tuned for A4.
- **Markdown source:** `docs/USER_MANUAL.md` works in any Markdown viewer (GitHub, VS Code, Obsidian).
