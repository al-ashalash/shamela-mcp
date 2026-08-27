/**
 * health's aya_index block has to describe the cache, not the session.
 *
 * stats() counted only the in-memory map, so the first health call after
 * startup reported the index as completely empty — measured live:
 * books_indexed 0, then 25 a few seconds later with no build in between,
 * while all 25 cache files had sat on disk for three days. The tool whose
 * own advice is "run me first if things look broken" was wrong precisely on
 * the first run.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { AyaIndexStore } from "../../src/server/ayaIndex/store.js";
import { AYA_INDEX_SCHEMA_VERSION, VERSION } from "../../src/server/constants.js";
import type { PageStore } from "../../src/server/pages.js";

let dir: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "aya-stats-"));
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

function cacheFile(bookId: number, confidence: string, ayat: number, over: Record<string, unknown> = {}) {
    fs.writeFileSync(
        path.join(dir, `${bookId}.json`),
        JSON.stringify({
            schema: AYA_INDEX_SCHEMA_VERSION,
            builder: VERSION,
            book_id: bookId,
            source: { size: 1, mtime_ms: 1 },
            confidence,
            coverage: { ayat, pct: 1 },
            pages: [],
            titles: [],
            ranges: {},
            granularity: {},
            surah_pages: [],
            ...over,
        }),
        "utf8",
    );
}

const store = () => new AyaIndexStore("D:\\nowhere", {} as unknown as PageStore, dir);

describe("stats() reads the disk cache, not only the session", () => {
    it("counts cached books before anything is loaded", () => {
        cacheFile(1114, "high", 6000);
        cacheFile(23628, "medium", 4000);
        const s = store().stats();
        expect(s.books_indexed).toBe(2);
        expect(s.books_high).toBe(1);
        expect(s.books_medium).toBe(1);
        expect(s.total_entries).toBe(10_000);
    });

    it("does not count a file from another schema or builder generation", () => {
        cacheFile(1, "high", 100);
        cacheFile(2, "high", 100, { schema: -1 });
        cacheFile(3, "high", 100, { builder: "0.0.0" });
        expect(store().stats().books_indexed).toBe(1);
    });

    it("skips corrupt files without failing the whole report", () => {
        cacheFile(1, "high", 100);
        fs.writeFileSync(path.join(dir, "2.json"), "{ not json", "utf8");
        fs.writeFileSync(path.join(dir, "notes.txt"), "irrelevant", "utf8");
        const s = store().stats();
        expect(s.books_indexed).toBe(1);
    });

    it("reports zero, not an error, when the cache directory does not exist yet", () => {
        const s = new AyaIndexStore("D:\\nowhere", {} as unknown as PageStore, path.join(dir, "absent")).stats();
        expect(s.books_indexed).toBe(0);
        expect(s.total_entries).toBe(0);
    });
});
