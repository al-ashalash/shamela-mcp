/**
 * The second field sweep's findings, pinned so none returns.
 *
 * Each block is one confirmed finding from the adversarial sweep over the
 * three new tools and the engine change (24 Aug). The rule of this repo is
 * that a bug report becomes a regression test; the sweep's reports are bug
 * reports like any other.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runVerifyQuote, verifyQuoteInput, quoteWords } from "../../src/server/tools/verifyQuote.js";
import { runScanConsensus, scanConsensusInput } from "../../src/server/tools/scanConsensus.js";
import { runResearchScope, researchScopeInput } from "../../src/server/tools/researchScope.js";
import { runSearchBoolean, searchBooleanInput } from "../../src/server/tools/searchBoolean.js";
import { runSearchExact, searchExactInput } from "../../src/server/tools/searchExact.js";
import { tokenizeArabic } from "../../src/server/arabic.js";
import { FIXTURE_BOOK_ID, getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;
let body = "";

beforeAll(async () => {
    backend = await getBackend();
    const batch = await backend.helper.request<{
        results: Array<{ page_id: number; found: boolean; body: string }>;
    }>("get_pages_batch", { book_id: FIXTURE_BOOK_ID, page_ids: [63] });
    body = (batch.results[0]?.body ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    expect(body.length).toBeGreaterThan(200);
}, 120_000);

const run = (text: string, n: number, from: number) =>
    text.split(" ").filter(Boolean).slice(from, from + n).join(" ");

describe("finding 1 — an editor's comma must not flip a verdict", () => {
    it("a comma glued to a word leaves the quotation verbatim", async () => {
        // Before: «حكم،» rode into the token, matched no index term, and a
        // quotation the book holds letter for letter came back not_found.
        const words = run(body, 6, 5).split(" ");
        words[2] = `${words[2]}،`;
        const out = await runVerifyQuote(
            backend.helper,
            backend.catalog,
            backend.pages,
            verifyQuoteInput.parse({
                quote: words.join(" "),
                book_id: FIXTURE_BOOK_ID,
                response_format: "json",
            }),
        ).then((r) => r.structuredContent);
        expect(out.status).toBe("verbatim");
    }, 120_000);

    it("a spaced comma is not counted as a word of the quotation", () => {
        const words = quoteWords("تسوية فرع بأصل ، في حكم");
        expect(words.map((w) => w.raw)).toEqual(["تسوية", "فرع", "بأصل", "في", "حكم"]);
    });

    it("tokenizes a comma-glued pair as two words, matching the index", () => {
        expect(tokenizeArabic("حكم،فرع")).toEqual(["حكم", "فرع"]);
        expect(tokenizeArabic("قال؛ نعم؟")).toEqual(["قال", "نعم"]);
    });

    it("keeps the numeric separators, which are part of a number", () => {
        expect(tokenizeArabic("٣٫٥")).toEqual(["٣٫٥"]);
    });
});

describe("finding 2 — witnesses: 0 means zero witnesses", () => {
    it("returns no witness and renders no Witnesses section", async () => {
        const r = await runScanConsensus(
            backend.helper,
            backend.catalog,
            backend.pages,
            scanConsensusInput.parse({ question: "المسح", formulas: ["لا خلاف"], witnesses: 0 }),
        );
        const sc = r.structuredContent;
        expect(sc.formulas[0]!.pages).toBeGreaterThan(0);
        for (const row of sc.formulas) expect(row.witnesses).toEqual([]);
        expect(r.content[0]!.text).not.toMatch(/## الشواهد|## Witnesses/);
    }, 120_000);
});

describe("finding 3 — a windowed rollup says so", () => {
    it("carries coverage_basis on every row", async () => {
        const out = await runScanConsensus(
            backend.helper,
            backend.catalog,
            backend.pages,
            scanConsensusInput.parse({
                question: "الاستصناع",
                formulas: ["بالإجماع"],
                witnesses: 0,
                response_format: "json",
            }),
        ).then((r) => r.structuredContent);
        expect(out.formulas[0]!.coverage_basis).toMatch(/^(all_results|window)$/);
    }, 120_000);
});

describe("finding 4 — a scoped-out school is out of scope, not silent", () => {
    it("marks the schools the scope excluded as not_searched", async () => {
        const out = await runResearchScope(
            backend.helper,
            backend.catalog,
            researchScopeInput.parse({
                term: "الاستصناع",
                scope: { madhhab: ["shafii"] },
                response_format: "json",
            }),
        ).then((r) => r.structuredContent);
        // The Hanafis are the chief writers on istisnaa; scoped to Shafii
        // books they were never asked, and «silent» would be a false finding.
        for (const school of ["hanafi", "maliki", "hanbali"] as const) {
            const row = out.schools.find((s) => s.madhhab === school)!;
            expect(row.status, school).toBe("not_searched");
            expect(row.books_searched, school).toBe(0);
            expect(row.books_downloaded, school).toBeGreaterThan(0);
        }
        expect(out.caveats.join(" ")).toMatch(/خارج النطاق|out-of-scope/);
    }, 120_000);

    it("still calls a searched-and-empty school silent", async () => {
        const out = await runResearchScope(
            backend.helper,
            backend.catalog,
            researchScopeInput.parse({ term: "زقنطورية بلبلنسكية", response_format: "json" }),
        ).then((r) => r.structuredContent);
        for (const row of out.schools) {
            expect(row.status, row.madhhab).toBe("silent");
            expect(row.books_searched, row.madhhab).toBeGreaterThan(0);
        }
    }, 120_000);
});

describe("finding 5 — an over-long exclusion is refused, not broadened", () => {
    it("rejects a none_of term of more than five words", async () => {
        await expect(
            runSearchBoolean(
                backend.helper,
                backend.catalog,
                backend.pages,
                searchBooleanInput.parse({
                    all_of: ["الاستصناع"],
                    none_of: ["واحد اثنان ثلاثة أربعة خمسة ستة"],
                }),
            ),
        ).rejects.toThrow(/none_of/);
    }, 120_000);

    it("still accepts a five-word exclusion", async () => {
        const out = await runSearchBoolean(
            backend.helper,
            backend.catalog,
            backend.pages,
            searchBooleanInput.parse({
                all_of: ["الاستصناع"],
                none_of: ["واحد اثنان ثلاثة أربعة خمسة"],
                limit: 1,
                response_format: "json",
            }),
        ).then((r) => r.structuredContent);
        expect(out.total_in_window).toBeGreaterThan(0);
    }, 120_000);
});

describe("finding 7 — search_exact never claims its results widened", () => {
    it("says the candidates thinned and the check stayed exact", async () => {
        const six = run(body, 6, 5);
        const r = await runSearchExact(
            backend.helper,
            backend.catalog,
            backend.pages,
            searchExactInput.parse({
                query: six,
                preserve: { preserve_hamza: true },
                scope: { book_ids: [FIXTURE_BOOK_ID] },
            }),
        );
        const text = r.content[0]!.text;
        expect(text).not.toMatch(/أوسعُ مما طلبتَ|wider than what you asked/);
        if (r.structuredContent.dropped_tokens?.length) {
            expect(text).toMatch(/الفحص الحرفي|letter-exact check/);
        }
    }, 120_000);
});

describe("finding 10 — a gapped formula's witness shows the formula", () => {
    it("opens the window on «لا نعلم», not on the subject", async () => {
        const out = await runScanConsensus(
            backend.helper,
            backend.catalog,
            backend.pages,
            scanConsensusInput.parse({
                question: "الوضوء",
                formulas: ["لا نعلم خلافا"],
                witnesses: 4,
                distance: 25,
                response_format: "json",
            }),
        ).then((r) => r.structuredContent);
        const row = out.formulas[0]!;
        expect(row.witnesses.length).toBeGreaterThan(0);
        let showing = 0;
        for (const w of row.witnesses) {
            if (/لا\s+نَ?عْ?لَ?مُ?/.test(w.snippet.replace(/<[^>]*>/g, ""))) showing++;
        }
        // Before the fix the majority of witnesses for the interrupted formula
        // showed none of it; now the window opens on its contiguous head.
        expect(showing, `witnesses showing the formula: ${showing}/${row.witnesses.length}`).toBeGreaterThanOrEqual(
            Math.ceil(row.witnesses.length / 2),
        );
    }, 120_000);
});
