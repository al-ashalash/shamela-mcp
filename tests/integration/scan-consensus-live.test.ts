/**
 * Locating a dispute, on the real library.
 *
 * The anchor is «الاستصناع» — the contract-to-manufacture — chosen because its
 * shape in the tradition is known and lopsided: the Hanafis permit it and
 * claim ijmaa for it, and the other schools barely discuss it under that name.
 * A scan that cannot see that is not measuring anything.
 *
 * The property this file exists to defend is the one that made the tool need a
 * new engine command at all: the formula must be required AS A PHRASE. Before
 * that, «لا خلاف» near «المسح» returned 162 pages of which not one of the first
 * sixty contained «لا خلاف» — the words were merely scattered on the page, and
 * among the results sat pages recording the disagreement the formula denies.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runScanConsensus, scanConsensusInput } from "../../src/server/tools/scanConsensus.js";
import { CONSENSUS_LEXICON } from "../../src/server/consensusLexicon.js";
import { tokenizeArabic } from "../../src/server/arabic.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 180_000);

const scan = (args: Record<string, unknown>) =>
    runScanConsensus(
        backend.helper,
        backend.catalog,
        backend.pages,
        scanConsensusInput.parse({ response_format: "json", ...args }),
    ).then((r) => r.structuredContent);

describe("the formula is required as a phrase, not as scattered words", () => {
    it("returns pages whose own text carries the formula intact", async () => {
        const out = await scan({ question: "المسح", formulas: ["لا خلاف"], witnesses: 5, distance: 20 });
        const row = out.formulas[0]!;
        expect(row.pages).toBeGreaterThan(0);
        expect(row.witnesses.length).toBeGreaterThan(0);
        // Every witness must carry «لا خلاف» as two adjacent words. The old
        // near-mode passed «لا» from one end of the page and «خلاف» from the
        // other, so this is the assertion that pins the fix.
        for (const w of row.witnesses) {
            const tokens = tokenizeArabic(w.snippet);
            const adjacent = tokens.some((t, i) => t === "لا" && tokens[i + 1] === "خلاف");
            expect(adjacent, `witness without «لا خلاف» intact: ${w.snippet.slice(0, 120)}`).toBe(true);
        }
    }, 180_000);

    it("opens the witness on the formula, not on the subject", async () => {
        // The window used to centre on whichever word came first, so a reader
        // was shown twenty words of subject and no formula at all.
        const out = await scan({ question: "المسح", formulas: ["لا خلاف"], witnesses: 3, distance: 20 });
        for (const w of out.formulas[0]!.witnesses) {
            expect(w.snippet, w.snippet.slice(0, 80)).toContain("<mark>");
        }
    }, 180_000);
});

describe("the shape of a question the tradition has a known shape for", () => {
    it("finds the Hanafi ijmaa claim for al-istisnaa, in Hanafi books", async () => {
        const out = await scan({ question: "الاستصناع", families: ["ijmaa"], witnesses: 1 });
        const claimed = out.formulas.filter((f) => f.pages > 0);
        expect(claimed.length).toBeGreaterThan(0);
        // The school that permits it is the school that writes about it.
        const hanafiPages = claimed.reduce((n, f) => n + (f.by_madhhab.hanafi ?? 0), 0);
        const otherPages = claimed.reduce(
            (n, f) => n + (f.by_madhhab.maliki ?? 0) + (f.by_madhhab.shafii ?? 0) + (f.by_madhhab.hanbali ?? 0),
            0,
        );
        expect(hanafiPages).toBeGreaterThan(otherPages);
    }, 180_000);

    it("reports a zero beside the formula's own reach, so the zero can be read", async () => {
        // Scoped to Hanafi fiqh, the disagreement duals do not meet this
        // question — but they are used constantly in those same books, and
        // without that number a reader cannot tell an absent dispute from an
        // absent vocabulary.
        const out = await scan({
            question: "الاستصناع",
            formulas: ["روايتان", "قولان"],
            scope: { madhhab: ["hanafi"] },
            witnesses: 0,
        });
        expect(out.searched.scoped).toBe(true);
        expect(out.searched.books).toBeLessThan(out.searched.downloaded_total);
        for (const row of out.formulas) {
            expect(row.formula_pages_in_scope, row.formula).toBeGreaterThan(0);
        }
    }, 180_000);
});

describe("what it refuses to conclude", () => {
    it("carries a reading note on every answer, including a full one", async () => {
        const out = await scan({ question: "الاستصناع", formulas: ["بالإجماع"], witnesses: 0 });
        expect(out.reading_note).toBeTruthy();
        expect(out.reading_note).toMatch(/لا حكمٌ|not a finding/);
    }, 180_000);

    it("has no verdict field, and no total of one column against the other", async () => {
        const out = await scan({ question: "الاستصناع", witnesses: 0 });
        const keys = Object.keys(out);
        expect(keys).not.toContain("verdict");
        expect(keys).not.toContain("disputed");
        expect(keys).not.toContain("consensus");
        // Families report BOOKS touched — never a page total, which cannot be
        // summed across formulas without counting one page twice.
        expect(out.families.ijmaa).toHaveProperty("books_touched");
        expect(out.families.ijmaa).not.toHaveProperty("pages");
    }, 180_000);

    it("marks the formulas whose count runs ahead of their evidence", async () => {
        const out = await scan({ question: "الاستصناع", formulas: ["الإجماع", "بالإجماع"], witnesses: 0 });
        const flagged = out.formulas.find((f) => f.formula === "الإجماع");
        const plain = out.formulas.find((f) => f.formula === "بالإجماع");
        expect(flagged!.caveat).toBeTruthy();
        expect(plain!.caveat).toBeUndefined();
        expect(out.caveats.join(" ")).toMatch(/⚠️/);
    }, 180_000);

    it("says a zero is about this scope, not about the tradition", async () => {
        const out = await scan({ question: "زقنطورية", formulas: ["لا خلاف"], witnesses: 0 });
        expect(out.formulas[0]!.pages).toBe(0);
        expect(out.caveats.join(" ")).toMatch(/غير منزَّلة|not be downloaded/);
        expect(out.suggestions?.length).toBeGreaterThan(0);
    }, 180_000);
});

describe("the reader's own view", () => {
    it("puts the reading note above the numbers, not below them", async () => {
        const r = await runScanConsensus(
            backend.helper,
            backend.catalog,
            backend.pages,
            scanConsensusInput.parse({ question: "الاستصناع", families: ["ijmaa"], witnesses: 1 }),
        );
        const text = r.content[0]!.text;
        const note = text.indexOf("لا حكمٌ");
        const table = text.indexOf("|---");
        expect(note).toBeGreaterThan(-1);
        expect(table).toBeGreaterThan(-1);
        expect(note).toBeLessThan(table);
    }, 180_000);

    it("shows the zero rows, which are the point", async () => {
        // A formula that did NOT meet the question is evidence about the
        // question. Dropping the empty rows would leave only what was found.
        const r = await runScanConsensus(
            backend.helper,
            backend.catalog,
            backend.pages,
            scanConsensusInput.parse({ question: "الاستصناع", families: ["ijmaa"], witnesses: 0 }),
        );
        expect(r.content[0]!.text).toContain("| ٠ |");
    }, 180_000);

    it("names the school a formula's pages fall in", async () => {
        const r = await runScanConsensus(
            backend.helper,
            backend.catalog,
            backend.pages,
            scanConsensusInput.parse({ question: "الاستصناع", formulas: ["بإجماع"], witnesses: 0 }),
        );
        expect(r.content[0]!.text).toMatch(/حنفي|Hanafi/);
    }, 180_000);
});

describe("the whole lexicon runs", () => {
    it("sweeps every formula and returns a row for each", async () => {
        const out = await scan({ question: "المسح على الخفين", witnesses: 0 });
        expect(out.formulas).toHaveLength(CONSENSUS_LEXICON.length);
        expect(out.subject_pages).toBeGreaterThan(0);
        // A question this old is disputed, and the disagreement formulas
        // should reach more books than the agreement ones.
        expect(out.families.khilaf.books_touched).toBeGreaterThan(0);
    }, 300_000);
});
