# v1.0 Build Progress

Started: 2026-05-10
Last update: 2026-05-10

## Current phase

Phase 1 — Architecture lockdown

## Completed

- [x] Plan approved and saved to `~/.claude/plans/stateless-sauteeing-stardust.md`
- [x] mcp-builder skill fetched and audited against the plan
- [x] Status files initialized
- [x] **Phase 0.1**: Toggle + wildcard investigation → `docs/toggles-implementation.md`. Decisions: `morphology` ships, `wildcards` ships, `preserve_*` returns OPTION_NOT_SUPPORTED in v1.0.
- [x] **Phase 0.2**: Scope filter composition → `docs/scope-implementation.md`. Locked the scope schema; confirmed categories are FLAT (no parent_id, no transitive expansion).
- [x] **Phase 0.3**: Catalog + citation reality check → `docs/catalog-survey.md`. Live SQL run; confirmed master.db has no edition/publisher/city/editor columns. Corrected book 9942 facts: 23 top-level chapters, 0 parts, 0 service annotations.
- [x] **Phase 0.4**: Citation format → `docs/citation-format.md`. Locked the three styles (`shamela`/`short`/`full`) with byte-exact test cases.

## In progress

- Phase 1: Architecture lockdown → `docs/v1-architecture.md` and `docs/ipc-protocol.md`.

## Up next

- Phase 2: Build the 20 tools in dependency order (registerTool migration → catalog/citation/format infra → catalog tools → page tools → search tools → quran/services/extras).

## Notes

- v0.0.1 is intact at git tag `0.0.1`. v1.0 work happens on `main` and will only tag `1.0.0` after all Phase 3 assertions and the install test pass.
- Tool inventory locked at 20: 13 from PROMPT-MCPB-V1.0.md + 7 extras (Quran search/fetch, two service joins, three downloaded-book-awareness tools).
- Author stays `فاعل خير`. README + manifest stay Arabic-first.
