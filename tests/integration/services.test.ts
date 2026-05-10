import { describe, it, expect, beforeAll } from "vitest";

import type { ServiceStore } from "../../src/server/services.js";
import { getServiceStore } from "../fixtures/shared.js";

/**
 * Real service/{tafseer,hadeeth,trajim}.db lookups. The smoke fixture (book 9942)
 * has no service annotations, so we only check that the API behaves correctly
 * — known-key results vary by what books the user has downloaded. We assert
 * shape and graceful-empty behavior rather than absolute counts.
 */
describe("ServiceStore (real service DBs)", () => {
    let services: ServiceStore;

    beforeAll(async () => {
        services = await getServiceStore();
    });

    it("getBooksForKey returns an array (possibly empty) for tafseer aya 1", async () => {
        const hits = await services.getBooksForKey("tafseer", 1);
        expect(Array.isArray(hits)).toBe(true);
        for (const h of hits) {
            expect(typeof h.book_id).toBe("number");
            expect(typeof h.page_id).toBe("number");
        }
    });

    it("getBooksForKey returns an empty array for an out-of-range key", async () => {
        const hits = await services.getBooksForKey("tafseer", 9_999_999);
        expect(hits).toEqual([]);
    });

    it("getBooksForKey works for hadeeth service", async () => {
        const hits = await services.getBooksForKey("hadeeth", 1);
        expect(Array.isArray(hits)).toBe(true);
    });

    it("getBooksForKey works for trajim service", async () => {
        const hits = await services.getBooksForKey("trajim", 1);
        expect(Array.isArray(hits)).toBe(true);
    });

    it("listInService returns an array for tafseer", async () => {
        const ids = await services.listInService("tafseer");
        expect(Array.isArray(ids)).toBe(true);
        for (const id of ids) expect(typeof id).toBe("number");
    });

    it("listInService returns an array for hadeeth", async () => {
        const ids = await services.listInService("hadeeth");
        expect(Array.isArray(ids)).toBe(true);
    });

    it("listInService returns an array for trajim", async () => {
        const ids = await services.listInService("trajim");
        expect(Array.isArray(ids)).toBe(true);
    });
});
