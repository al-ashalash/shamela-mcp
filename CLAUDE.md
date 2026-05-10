# shamela-mcpb — Claude Code Context

This repo packages a Maktabah al-Shamela 4 search server as an `.mcpb` (MCP Bundle) for install into Claude Desktop. Architecture, IPC contract, citation format, and roadmap live in [docs/](docs/).

## Build commands

```powershell
npm install                 # one time per checkout
npm run build               # esbuild Node + javac Java helper
npm run test                # unit + integration suite (vitest)
npm run smoke               # exercise every tool against C:\shamela4; exits 0 on pass
npm run benchmark           # Mode 1 + Mode 2 workflow simulations
.\scripts\pack.ps1          # produces shamela-mcp-<version>.mcpb at repo root
```

## Hard rules

1. **Read-only access to Shamela's data.** All SQLite opens are read-only via sql.js, all Lucene reads via `DirectoryReader`. Never write to `<install>/database/` or `<install>/app/`.
2. **No copying of Shamela's code.** Clean-room boundary is the search engine spec. Reference the spec; write fresh code.
3. **Lucene + AlKhalil are NOT bundled.** They come from the user's Shamela install at runtime via classpath. We bundle our own helper jar (~45 KB).
4. **AlKhalil-Analyzer-2.1.jar and shamela-misc-1.0.0.jar must be present in `src/java/libs/` for the Java helper to compile.** That folder is gitignored. Populate from the local Shamela install:
   ```powershell
   Copy-Item C:\shamela4\app\lucene\2\AlKhalil-Analyzer-2.1.jar     src\java\libs\
   Copy-Item C:\shamela4\app\lucene\2\shamela-misc-1.0.0.jar        src\java\libs\
   ```
   (Adjust the source path if Shamela is installed elsewhere.)

## Path resolution priority (`src/server/paths.ts`)

For Windows users, the Shamela install location is user-chosen at install time. Resolution probes in order:

1. Env var `SHAMELA_INSTALL_ROOT` (set by Claude Desktop from `user_config.shamela_install_folder` per the manifest).
2. Windows registry — both `HKLM\…\Uninstall\*` and `HKCU\…\Uninstall\*`, including the `WOW6432Node` mirror, matching `DisplayName` containing "Shamela" or "المكتبة الشاملة"; returns `InstallLocation`.
3. Common locations: `C:\shamela4`, `C:\Program Files\shamela4`, `C:\Program Files (x86)\shamela4`, `%LOCALAPPDATA%\shamela4`, `%USERPROFILE%\shamela4`, `%USERPROFILE%\Desktop\shamela4`, `D:\shamela4` … `F:\shamela4`.

Accepts either an install root (with `database/` and `app/` siblings) or a `database/` folder directly. Throws `SHAMELA_NOT_FOUND` listing every path checked on failure.

## Testing rules (NEVER violate)

1. **No code without tests.** Every new function, tool, or module ships with at least one test in the same commit. PRs without tests are incomplete.

2. **Run the full test suite after every iteration.** Before declaring any change complete, run `npm run test` and confirm everything passes. If a test you didn't intend to touch starts failing, you've introduced a regression — find it before continuing.

3. **Bug reports become regression tests.** When the user (or a contributor) reports a bug, the fix has two parts in one commit:
   - First, write a failing test that reproduces the bug.
   - Then, fix the bug. The test now passes.
   - Commit both together with a message that references the bug.
     This guarantees the bug never silently returns.

4. **Test at the right layer.** Pure functions get unit tests in `tests/unit/`. Code that touches Lucene / SQLite / the JVM gets integration tests in `tests/integration/`. Don't write integration tests for logic that could be unit-tested — they're slower and they make the failure point harder to find.

5. **Tests must run from a clean checkout.** A new contributor cloning this repo should be able to run `npm install && npm run test` and see all tests pass (assuming a Shamela install is present and the helper jar is built). Don't write tests that depend on machine-specific state, half-built indexes, or "well, you have to do X first."

6. **Test assertions are not optional.** Every test must actually verify something — `expect(x).toBe(y)`, not "the code ran without throwing." A test without an assertion is a false confidence-builder.

7. **Don't disable tests to ship.** If a test fails, fix the test or fix the code; don't `.skip` it. Skipped tests rot. The only acceptable use of `.skip` is when a feature is genuinely deferred (e.g., `preserve_*` toggles awaiting v1.1) — and even then, prefer a passing test that asserts the deferral via `OPTION_NOT_SUPPORTED`.

8. **Smoke tests are not unit tests.** `tests/smoke.ts` is a fast end-to-end gut-check. It still exists and still runs. But it does not replace fine-grained tests — it complements them.

## Test commands

```powershell
npm run test                # run all tests (unit + integration)
npm run test:unit           # fast — no JVM, no SQLite
npm run test:integration    # slower — needs Shamela install + book 9942
npm run test:watch          # watch mode for development
npm run test:coverage       # generate coverage report (HTML in coverage/)
npm run smoke               # the legacy fast smoke check (stays for now)
```

## Test layer reference

| Layer       | Directory                      | What it tests                             | Speed   |
| ----------- | ------------------------------ | ----------------------------------------- | ------- |
| Unit        | `tests/unit/`                  | Pure functions, no I/O                    | ms      |
| Integration | `tests/integration/`           | Real Lucene / SQLite / JVM / MCP protocol | seconds |
| Smoke       | `tests/smoke.ts`               | End-to-end sanity check                   | seconds |
| Benchmark   | `tests/benchmark.ts`           | Mode 1 / Mode 2 workflow simulations      | minutes |

## Best practices for this project

- **Arabic text in tests:** save `.test.ts` files as UTF-8 without BOM. Don't use `ا`-style escapes when literal Arabic is clearer; reserve escapes for non-printing characters.
- **JVM startup is the slow part.** Integration tests share one JVM via `tests/fixtures/shared.ts`. The vitest config sets `isolate: false` and `fileParallelism: false` so module-level singleton caching survives across files. Don't spawn a fresh helper per test.
- **Lucene results depend on indexed data.** Tests that assert hit counts (e.g. `9` for "الكلام") are anchored to **book 9942 alone** — the canonical fixture documented in `tests/fixtures/shared.ts`. If you add fixture books, document them there.
- **Don't test Shamela's behavior — test ours.** A test that asserts "Lucene tokenizes correctly" is testing Apache Lucene. We assume Lucene works. We test that *our* code calls Lucene correctly and handles the results correctly.
- **Time-sensitive data:** none. No need for clock mocking. If a future feature needs time, mock with `vi.useFakeTimers()`.
- **Coverage is a tool, not a goal.** ~80% line coverage on pure modules is a healthy floor. Don't chase 100% by writing tests for trivial getters; do chase coverage for any function with branching logic.
- **CI status:** `.github/workflows/test.yml` runs unit tests on push. Integration tests need a Shamela install — deferred to a future runner spec.
- **The `.wasm` stub:** `vitest.config.ts` ships an inline plugin that returns an empty `Uint8Array` for any `.wasm` import. This shields tests from the esbuild-only `import sqlWasm from "sql.js/dist/sql-wasm.wasm"` in `src/server/index.ts`. Tests load the real wasm via `fs.readFileSync` in the shared fixture. Don't remove the plugin without understanding both code paths.
