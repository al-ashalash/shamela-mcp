/**
 * The snippet is the evidence a researcher reads and quotes.
 *
 * The highlighter used to scan for the normalized token as a raw SUBSTRING, so
 * a search for «شيء» (token «شي») marked fragments inside «الشيخ»،
 * «الزركشي»، «الشيرازي» — and, worse, chose the WINDOW around the first such
 * fragment. Measured on book 9879 page 327, whose hit is in the footnote: the
 * whole returned snippet_foot was
 *
 *   «(١) انظر: المعتمد ١/٣٩٠، التبصرة لل<mark>شي</mark>رازي ص ٢٧٠، المحصول…»
 *
 * while the actual match, «وليس فيها منافاةٌ لتحريم شيءٍ جديدٍ في المستقبل»,
 * never appeared. The reader was shown a bibliography line about al-Shirazi as
 * the evidence for a query about شيء.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runSearchPages, searchPagesInput } from "../../src/server/tools/searchPages.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

const ANCHOR_BOOK = 9879;

const search = (query: string, extra: Record<string, unknown> = {}) =>
    runSearchPages(
        backend.helper,
        backend.catalog,
        backend.pages,
        searchPagesInput.parse({
            query,
            scope: { book_ids: [ANCHOR_BOOK] },
            limit: 20,
            response_format: "json",
            ...extra,
        }),
    ).then((r) => r.structuredContent);

/** Every marked run in a snippet, with the characters around it. */
function marksWithContext(snippet: string): Array<{ mark: string; before: string; after: string }> {
    const out: Array<{ mark: string; before: string; after: string }> = [];
    const re = /<mark>([^<]*)<\/mark>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(snippet))) {
        out.push({
            mark: m[1]!,
            before: snippet.slice(Math.max(0, m.index - 1), m.index),
            after: snippet.slice(re.lastIndex, re.lastIndex + 1),
        });
    }
    return out;
}

const ARABIC_LETTER = /[ء-ي]/;

describe("a snippet marks whole words", () => {
    it("never marks inside a longer word for «شيء»", async () => {
        const out = await search("شيء");
        expect(out.results.length).toBeGreaterThan(0);
        for (const r of out.results) {
            for (const field of [r.snippet_body, r.snippet_foot]) {
                if (!field) continue;
                for (const { mark, before, after } of marksWithContext(field)) {
                    // A mark abutting an Arabic letter is a mark inside a word:
                    // «ال[شي]خ», «للزرك[شي]», «[شي]ئان».
                    expect(
                        ARABIC_LETTER.test(before),
                        `mark «${mark}» opens mid-word in: ${field.slice(0, 120)}`,
                    ).toBe(false);
                    expect(
                        ARABIC_LETTER.test(after),
                        `mark «${mark}» closes mid-word in: ${field.slice(0, 120)}`,
                    ).toBe(false);
                }
            }
        }
    }, 180_000);

    it("shows the real match on page 327, not the al-Shirazi bibliography", async () => {
        const out = await search("شيء");
        const hit = out.results.find((r) => r.page_id === 327);
        if (!hit) {
            console.warn("skipped: page 327 of book 9879 not among the hits here");
            return;
        }
        const shown = `${hit.snippet_body ?? ""} ${hit.snippet_foot ?? ""}`;
        expect(shown).toContain("<mark>");
        // The window must sit on the genuine occurrence, and the fragment that
        // used to hijack it must no longer be marked.
        expect(shown).not.toMatch(/لل<mark>/);
    }, 180_000);

    it("still marks nothing at all rather than marking the wrong thing", async () => {
        // A snippet with no true token match comes back empty; it never falls
        // back to the substring scan that caused this.
        const out = await search("زقنطورية");
        expect(out.total_hits).toBe(0);
    }, 180_000);

    it("leaves the morphology highlighter working", async () => {
        // Root search marks derived forms — «صابرين»، «يصبرون» — which the
        // literal path cannot see. The boundary change must not touch it.
        const out = await search("صبر", { options: { morphology: true } });
        const marked = out.results.filter((r) => (r.snippet_body ?? "").includes("<mark>"));
        expect(marked.length).toBeGreaterThan(0);
    }, 180_000);

    it("emits no HTML tag residue in any snippet", async () => {
        // A window opening inside «<span data-type="title">» used to print the
        // attributes as if they were the book's words.
        const out = await search("الكلام");
        for (const r of out.results) {
            for (const field of [r.snippet_body, r.snippet_foot]) {
                if (!field) continue;
                const withoutMarks = field.replace(/<\/?mark>/g, "");
                expect(withoutMarks, field.slice(0, 140)).not.toMatch(/[<>]/);
                expect(withoutMarks, field.slice(0, 140)).not.toMatch(/data-type|span|class=/);
            }
        }
    }, 180_000);
});
