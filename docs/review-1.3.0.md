# Maintainer review of `next/1.3.0` — what was changed on merge, and why

The branch was reviewed against a **complete** Shamela install on macOS
(8,597 books on disk, 8,598 in the catalogue) and merged with six fixes applied
on top. Nothing in the feature work was altered: no tool, no handler, no
schema, no output text. Everything below is a guard, a test, or a build script.

The release itself stands as authored — **1.3.0, not 2.0.0**. The argument in
`docs/release-1.3.0.md` is accepted: the tool surface is additive (30 → 34, none
removed or renamed), no `structuredContent` field was dropped or retyped, and no
input became required. See "The one thing left open" at the end.

---

## 1. The landing page announced a version that was never released

`docs/index.html` still carried `2.0.0` in its version badge after the branch
renamed the release to 1.3.0. The commit that did the rename updated
`manifest.json`, `package.json`, `constants.ts` and the README, and missed the
badge.

This mattered more than a typo, because **CI would have caught it and the
release command would not**. `.github/workflows/test.yml` on this branch runs
`npm run check:versions`; that script exited 1. The PR was red on arrival.

Fixed: badge now reads `1.3.0`.

## 2. The version guard could not tell "no footers" from "footers disagree"

`scripts/check-versions.mjs` searched for `Version 1.3.0` inside each language
block and compared the distinct results. The landing page has never had that
shape — the number lives once, in a `.lat` span, and only the *label* beside it
is translated. So the regex matched nothing on every run, and an empty set is
not one value, so it printed:

```
[FAIL] docs/index.html (0 localized footers)   MIXED:
```

A guard that fails while naming a disagreement among zero items trains people to
ignore it, which is worse than not having it.

Replaced with a stricter and cheaper rule: **every version-shaped string on the
landing page must equal the manifest version.** That is what the badge bug
actually needed, and it has no shape assumption to rot.

It fails closed — writing some other product's `X.Y.Z` on that page (a JDK, a
Lucene build) will trip it. That is deliberate; prefer wording it without a
version over teaching the guard exceptions it cannot verify.

## 3. Three tests encoded "my library is partial" as an invariant

This is the important one, because it will bite again.

On a complete library the suite reported **4 failures out of 895 — all of them
tests, none of them code.** Every failure was a test asserting something only
true of a partially-downloaded install:

| Test | Assumed | True here |
| --- | --- | --- |
| `book-metadata-live.test.ts:34` | `NOT_DOWNLOADED = 80` | Book 80 **is** on disk; the card correctly said `readable` and two tests failed on correct output |
| `mcp-server.test.ts:607` | fixture 9942 within 20 pages × 100 | 8,597 books downloaded; 9942 sorts past the 2,000 cap and was never reached |
| `fixture-shape.test.ts:54` | `user_excluded INTEGER` | This build has `user_excluded INTEGER DEFAULT 0` |

The repo's own Testing Rule 5 forbids exactly this ("tests must run from a clean
checkout; don't write tests that depend on machine-specific state"). The
practical damage is inverted from the usual: CI and any contributor with a
partial library go **green**, while a maintainer with the whole library goes
**red** — so the signal fails on the machine most likely to be right.

Fixes:

- **Ask the catalogue, don't name a book.** New
  `findNotDownloadedBookId(catalog)` in `tests/fixtures/shared.ts` returns the
  first catalogued book with no file, or `null` when every book is present.
  On this machine that resolves to **30200**, the single catalogue entry with no
  file. When it returns `null` the tests assert that completeness explicitly
  rather than passing quietly — a `null` from a broken lookup must not read as
  green.
- **Page to exhaustion.** The 20-page cap is now
  `catalog.bookCount() + 1`, which cannot end the walk early because it exceeds
  the catalogue; it only stops a runaway.
- **Ignore column defaults.** `DEFAULT <literal>` is stripped before comparing
  schemas. A default governs what an INSERT stores and this project never
  inserts — every open is read-only. Table names, column names and column types
  are still compared exactly, so real drift still fails.

**When writing an integration test: never hardcode a book id to mean "absent",
and never cap pagination below the catalogue size.** Derive both.

## 4. The build could not find a macOS install

`scripts/build-java.mjs` probed for `~/Library/Application Support/shamela4`.
The macOS build installs to `~/Library/Application Support/**Shamela**` —
capital S, no `4`. Every macOS candidate used the Windows folder name, so
discovery never succeeded on a real Mac and the build died telling the developer
to set `SHAMELA_INSTALL_ROOT` on the one platform where it could have guessed.

Fixed; `npm run build:java` now works on macOS with no environment variables.

## 5. The release command skipped the checks CI runs

`scripts/release.mjs` was unchanged on this branch. Its pre-flight step 4
compared `manifest.json` against `package.json` and stopped — the easy pair,
edited together. The far copies rot, which is precisely how §1 happened.

Step 4 now runs `check-versions.mjs` and `check-landing-langs.mjs` in full.
Both new guards were written on this branch and wired only to CI; the release
path could still have shipped the stale badge.

## 6. A stale count in a comment

`src/server/schemaCompat.ts` said "sixty-four declarations across the thirty-two
tools". Reworded to "two declarations per tool, across every tool the server
registers" so it stops needing an edit each time a tool is added.

---

## After the fixes

Against the full library, on macOS, JDK 21:

```
tsc --noEmit          clean
npm run test          895 passed (895), 70 files
npm run smoke         41/41 assertions
npm run check:versions / check:landing   green
```

Test count is unchanged at 895 — these fixes correct what the tests assert, not
how many there are.

## Running the suite on macOS

Not currently in `CLAUDE.md`, which documents the Windows paths:

```bash
brew install openjdk@21           # Shamela bundles a JRE only — no javac
export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
export PATH="$JAVA_HOME/bin:$PATH"
cp ~/Library/Application\ Support/Shamela/app/lucene/2/AlKhalil-Analyzer-2.1.jar src/java/libs/
cp ~/Library/Application\ Support/Shamela/app/lucene/2/shamela-misc-1.0.0.jar   src/java/libs/
npm run build:java && npm run test
```

`SHAMELA_INSTALL_ROOT` is no longer needed on macOS after §4.

---

## The one thing left open

`CLAUDE.md` lists as MAJOR: *"Changed tool semantics so the same input now
returns materially different results (e.g. a search returns different hits)."*
`docs/release-1.3.0.md` tabulates six such changes, and is right to — hamza
queries, the 8% of the library that was unreadable, the silent zero past five
words, whole-library phrase search, `candidate_cap_hit`.

Read literally, that rule makes this a major release. It shipped as 1.3.0
because every one of those changes is a **bug fix moving a wrong answer to a
right one**, no integrator's code breaks, and the rule's own examples are about
the *contract*, not about a corrected result.

That reading is now precedent. If it is the wrong one, the rule needs rewording
rather than the next release needing an argument.

## Not changed, for the record

- **`docs/release-1.3.0.md` closes with "تقرأ ولا تكتب"** ("reads and does not
  write"). The extension does write one thing: the aya-index cache, under the
  user's application-data folder (`src/server/ayaIndex/store.ts`), never inside
  the Shamela install. The claim is defensible as "writes nothing to your
  library" and the manifest words it precisely. Left as authored — flagged only
  so the choice is deliberate.
- **`withNeutralSchemas`** walks every outgoing message at any depth, including
  large tool results where no `$schema` key can appear. Only `tools/list`
  responses need stripping. Correct as written, and worth narrowing if page or
  `root_stats` payloads ever show send-side cost.
