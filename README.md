# shamela-mcpb

A one-double-click Claude Desktop extension (`.mcpb`) that lets Claude search a locally-installed copy of **Maktabah al-Shamela 4** (the Arabic Islamic library, `shamela.ws`).

Three tools:

- **`shamela_search_pages`** — full-text search across the bodies and footnotes of every book you've downloaded inside Shamela.
- **`shamela_search_books`** — search Shamela's catalog of 8 500+ books by name, author, or bibliography. Works even before any books are downloaded.
- **`shamela_search_authors`** — search 3 100+ authors by name or biography.

All searches happen locally. Nothing is sent over the network.

---

## Install

1. Make sure you have **Maktabah al-Shamela 4** installed and at least one book downloaded (open Shamela and pick any book from the catalog). The `.mcpb` reads Shamela's local database read-only — you keep using Shamela exactly as before.
2. Download `shamela-mcp-0.0.1.mcpb` from this repo's Releases.
3. Double-click the `.mcpb`. Claude Desktop opens with an install dialog.
4. The dialog has two optional fields:
   - **Shamela installation folder** — leave empty to auto-detect. Fill in only if Shamela is installed somewhere unusual.
   - **Java executable** — advanced. Leave empty to use the JRE bundled inside Shamela.
5. Click Install. **Fully quit Claude Desktop** (right-click the tray icon → Quit; closing the window is not enough), then re-launch.

## Verify it works

In a fresh Claude chat, try:

> Search Shamela for `الكلام` and tell me which books mention it.

If you see results with book names, author names, and printed-page references, you're set. If not, see Troubleshooting.

## Troubleshooting

- **The tool doesn't appear after install.** You probably didn't fully quit Claude Desktop. Right-click the tray icon → Quit, wait two seconds, then re-launch.
- **Tool returns "Could not locate a Shamela 4 install."** Auto-detect didn't find your Shamela. Open Claude Desktop's Extension settings, find shamela-mcpb, and fill in the **Shamela installation folder** field with the directory that contains `database` and `app` subfolders (e.g. `D:\my-apps\shamela4`).
- **Tool returns 0 hits for a query you'd expect to find something.** v0.0.1 uses the default search behavior only — no morphology, no diacritic toggles, no OR/NOT panels. Try searching for a substring of your phrase. The Shamela app itself supports advanced search; this MCP currently only matches Shamela's default mode.
- **You downloaded a new book in Shamela but the MCP doesn't see it.** Restart Claude Desktop. The MCP caches the Lucene reader at startup.

## What this needs (auto-detected; only for the curious)

- A Shamela 4 install. The MCP probes — in order — the `SHAMELA_INSTALL_ROOT` env var, the Windows registry's Uninstall keys (HKLM and HKCU, including the WOW6432Node mirror), and a list of common locations across drives C:..F:.
- Shamela's bundled JRE (typically at `<shamela>\app\win\64\jre\2\`). Override with `SHAMELA_JRE` if you want to use a different Java.

## Privacy

All searches run locally on your machine. The MCP opens Shamela's database and Lucene index files read-only. Nothing is sent over the network. The MCP cannot modify Shamela's data even if asked to.

## Reporting issues

Paste the smoke-test output (it prints every resolved path) along with what you tried.

## License

MIT. See `LICENSE`.

---

## Coming in v0.1

- `shamela_get_page` — fetch a specific page by book + page id.
- `shamela_get_book_toc` — table of contents for a downloaded book.
- `shamela_search_titles` — search just chapter/section titles.
- `shamela_search_quran` — Quranic verse search across the pre-built `aya` index.
- Morphology toggle (root-form expansion via AlKhalil).
- Diacritic / hamza / number preservation toggles.
- Scope filtering (categories, authors, periods, favorites).
