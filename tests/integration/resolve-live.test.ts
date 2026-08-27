/**
 * The two resolve failures the sweep measured, against the real index.
 *
 * «صحيح البخاري» at the default limit returned five shurūḥ and selections —
 * not one of them the matn — because constant scores collapsed the order to
 * ascending id. And no hit said whether it was downloaded, although resolve
 * is the tool the descriptions send callers to BEFORE search_pages, and
 * search covers downloaded books only.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { runResolve, resolveInput } from "../../src/server/tools/resolve.js";
import { getBackend } from "../fixtures/shared.js";

let backend: Awaited<ReturnType<typeof getBackend>>;

beforeAll(async () => {
    backend = await getBackend();
}, 120_000);

const resolve = (query: string, extra: Record<string, unknown> = {}) =>
    runResolve(
        backend.helper,
        backend.catalog,
        resolveInput.parse({ query, type: "book", response_format: "json", ...extra }),
    );

describe("resolve puts the thing you named first", () => {
    it("«صحيح البخاري» leads with صحيح البخاري, at the DEFAULT limit", async () => {
        const r = await resolve("صحيح البخاري");
        const names = r.structuredContent.books.map((b) => b.book_name);
        expect(names.length).toBeGreaterThan(0);
        // The base name of the first hit — before Shamela's « - » suffix —
        // must be the queried title itself, not a sharḥ that contains it.
        expect(names[0]!.split(" - ")[0]!.trim()).toBe("صحيح البخاري");
    }, 120_000);

    it("every hit says whether it is downloaded", async () => {
        const r = await resolve("صحيح البخاري", { limit: 10 });
        for (const b of r.structuredContent.books) {
            expect(typeof b.downloaded, b.book_name).toBe("boolean");
        }
    }, 120_000);

    it("warns when nothing it returned can be searched", async () => {
        // markdown: the warning is prose on the surface the reader reads.
        const r = await resolve("صحيح البخاري", { limit: 5, response_format: "markdown" });
        const { books } = r.structuredContent;
        const md = r.content[0]!.text;
        if (books.every((b) => !b.downloaded)) {
            expect(md).toMatch(/لا شيء من هذه الكتب منزَّل|None of these books is downloaded/);
        } else {
            // At least one hit is searchable here, so the warning must NOT fire.
            expect(md).not.toMatch(/لا شيء من هذه الكتب منزَّل/);
        }
    }, 120_000);

    it("still finds a book the old order found", async () => {
        // Re-ranking reorders; it must not lose. الروض المربع is downloaded on
        // the anchor machine and its five hits all scored identically too.
        const r = await resolve("الروض المربع");
        const names = r.structuredContent.books.map((b) => b.book_name);
        expect(names.some((n) => n.includes("الروض المربع"))).toBe(true);
        expect(names[0]!.split(" - ")[0]!.trim()).toBe("الروض المربع بشرح زاد المستقنع");
    }, 120_000);
});
