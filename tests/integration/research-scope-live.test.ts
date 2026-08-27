/**
 * The coverage receipt against the real library.
 *
 * The two zero-states cannot be shown here — this install has every madhhab
 * book downloaded — so they are pinned in tests/unit/research-scope.test.ts
 * against a synthetic library that has Shafii and Hanbali books and no Hanafi
 * or Maliki ones. What THIS file proves is that the numbers are the library's
 * own: that the receipt reproduces a profile the tradition is known to have.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runResearchScope, researchScopeInput } from "../../src/server/tools/researchScope.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 180_000);

const receipt = (args: Record<string, unknown>) =>
    runResearchScope(
        backend.helper,
        backend.catalog,
        researchScopeInput.parse({ response_format: "json", ...args }),
    ).then((r) => r.structuredContent);

describe("the receipt is built from the library's own rollup", () => {
    it("reproduces the shape of a question whose shape is known", async () => {
        // خيار المجلس: affirmed by the Shafiis and Hanbalis on the hadith,
        // rejected by the Hanafis and Malikis on the practice of Madina. Both
        // sides write about it — so all four schools must be non-empty, and
        // the two that affirm it should carry more of it.
        const out = await receipt({ term: "خيار المجلس" });
        for (const s of out.schools) {
            expect(s.status, s.madhhab).toBe("found");
            expect(s.pages_by_term["خيار المجلس"], s.madhhab).toBeGreaterThan(0);
        }
        const affirming =
            out.schools.find((s) => s.madhhab === "shafii")!.pages_by_term["خيار المجلس"]! +
            out.schools.find((s) => s.madhhab === "hanbali")!.pages_by_term["خيار المجلس"]!;
        const rejecting =
            out.schools.find((s) => s.madhhab === "hanafi")!.pages_by_term["خيار المجلس"]! +
            out.schools.find((s) => s.madhhab === "maliki")!.pages_by_term["خيار المجلس"]!;
        expect(affirming).toBeGreaterThan(rejecting);
    }, 180_000);

    it("names books a reader can open, from the same rollup", async () => {
        const out = await receipt({ term: "خيار المجلس" });
        const shafii = out.schools.find((s) => s.madhhab === "shafii")!;
        expect(shafii.books.length).toBeGreaterThan(0);
        expect(shafii.books[0]!.pages).toBeGreaterThan(0);
        expect(shafii.books[0]!.book_name.length).toBeGreaterThan(2);
        // Ordered by how much of the term each holds.
        for (let i = 1; i < shafii.books.length; i++) {
            expect(shafii.books[i - 1]!.pages).toBeGreaterThanOrEqual(shafii.books[i]!.pages);
        }
    }, 180_000);

    it("counts what falls outside the four schools rather than hiding it", async () => {
        const out = await receipt({ term: "خيار المجلس" });
        const inSchools = out.schools.reduce((n, s) => n + (s.pages_by_term["خيار المجلس"] ?? 0), 0);
        const outside = out.outside_the_schools.pages_by_term["خيار المجلس"] ?? 0;
        expect(outside).toBeGreaterThan(0);
        expect(inSchools + outside).toBe(out.total_by_term["خيار المجلس"]);
    }, 180_000);

    it("measures each wording separately", async () => {
        const out = await receipt({ term: "خيار المجلس", synonyms: ["خيار المتبايعين"] });
        expect(out.terms).toHaveLength(2);
        for (const s of out.schools) {
            expect(Object.keys(s.pages_by_term)).toHaveLength(2);
        }
        expect(out.total_by_term["خيار المجلس"]).not.toBe(out.total_by_term["خيار المتبايعين"]);
    }, 180_000);

    it("respects a scope, and says it was scoped", async () => {
        const out = await receipt({ term: "خيار المجلس", scope: { madhhab: ["shafii"] } });
        expect(out.searched.scoped).toBe(true);
        expect(out.searched.books).toBeLessThan(out.searched.downloaded_total);
        // Scoped to one school, the others are empty — and must still be told
        // apart: their books exist on this machine, they were simply not read.
        expect(out.schools.find((s) => s.madhhab === "shafii")!.status).toBe("found");
        for (const other of ["hanafi", "maliki", "hanbali"]) {
            expect(out.schools.find((s) => s.madhhab === other)!.books_with_hits, other).toBe(0);
        }
    }, 180_000);
});

describe("the reader's own view", () => {
    it("carries the reading note, the four rows, and the remainder row", async () => {
        const r = await runResearchScope(
            backend.helper,
            backend.catalog,
            researchScopeInput.parse({ term: "خيار المجلس" }),
        );
        const text = r.content[0]!.text;
        expect(text).toMatch(/ثلاثة أصفار|three different zeros/);
        for (const school of ["حنفي", "مالكي", "شافعي", "حنبلي"]) expect(text).toContain(school);
        expect(text).toMatch(/خارج المذاهب الأربعة|Outside the four/);
    }, 180_000);
});
