/**
 * Regression test for the zero-padded bucket-folder bug (#42).
 *
 * Shamela stores per-book SQLite files under `database/book/<id % 1000>/<id>.db`,
 * but current Shamela 4 builds zero-pad the bucket folder to three digits
 * (`book/009/9.db`) while the reader used to build the path unpadded
 * (`book/9/9.db`). The two spellings only differ for buckets < 100, so every
 * book with `id % 1000 < 100` was misreported as «منزَّل لكن بلا صفحات مقروءة»
 * while Lucene search (which reads Shamela's own index) kept returning its
 * text — an internal contradiction that poisoned "not found in the library"
 * conclusions. The canonical fixture book (9942 → bucket 942) could never
 * catch this, hence this dedicated test over a synthetic library exercising
 * all three layouts.
 *
 * Runs without a Shamela install: it fabricates minimal per-book DBs via
 * sql.js in a temp folder.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import initSqlJs from "sql.js";

import { PageStore } from "../../src/server/pages.js";
import { getSqlWasm } from "../fixtures/shared.js";

/** Books covering the three on-disk layouts. */
const PADDED_ID = 9; // bucket 9  → modern layout  book/009/9.db
const LEGACY_ID = 7; // bucket 7  → legacy layout  book/7/7.db
const HIGH_ID = 10_942; // bucket 942 → identical in both spellings
const MISSING_ID = 555; // downloaded nowhere

let tempRoot: string;
let pages: PageStore;

async function writeBookDb(dir: string, bookId: number, pageId: number, printed: number): Promise<void> {
    const SQL = await initSqlJs({
        wasmBinary: (() => {
            const buf = getSqlWasm();
            return (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength
                ? buf.buffer
                : buf.slice().buffer) as ArrayBuffer;
        })(),
    });
    const db = new SQL.Database();
    db.run("CREATE TABLE page (id INTEGER PRIMARY KEY, part TEXT, page INTEGER, number INTEGER, services TEXT)");
    db.run("CREATE TABLE title (id INTEGER PRIMARY KEY, page INTEGER, parent INTEGER)");
    db.run("INSERT INTO page (id, part, page, number, services) VALUES (?, NULL, ?, NULL, NULL)", [
        pageId,
        printed,
    ]);
    db.run("INSERT INTO title (id, page, parent) VALUES (1, ?, 0)", [pageId]);
    const bytes = db.export();
    db.close();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${bookId}.db`), bytes);
}

beforeAll(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "shamela-bucket-test-"));
    // Modern zero-padded layout for a bucket < 100 (the bug's exact shape).
    await writeBookDb(path.join(tempRoot, "book", "009"), PADDED_ID, 63, 71);
    // Legacy unpadded layout must keep working too.
    await writeBookDb(path.join(tempRoot, "book", "7"), LEGACY_ID, 5, 12);
    // Bucket >= 100: both spellings coincide.
    await writeBookDb(path.join(tempRoot, "book", "942"), HIGH_ID, 3, 9);
    pages = new PageStore(tempRoot, getSqlWasm());
});

afterAll(() => {
    // Best-effort cleanup: on Windows the wasm FS may keep a transient handle.
    try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
        /* best-effort */
    }
});

describe("PageStore bucket-folder resolution (#42)", () => {
    it("reads a book stored under a zero-padded bucket (book/009/9.db)", async () => {
        expect(await pages.hasBook(PADDED_ID)).toBe(true);
        const row = await pages.getPageRow(PADDED_ID, 63);
        expect(row).not.toBeNull();
        expect(row!.page_id).toBe(63);
        // pageCount is MAX(id)-based (real books have sequential page ids).
        expect(await pages.pageCount(PADDED_ID)).toBeGreaterThan(0);
        expect(await pages.bookHasContent(PADDED_ID)).toBe(true);
    });

    it("still reads a book stored under a legacy unpadded bucket (book/7/7.db)", async () => {
        expect(await pages.hasBook(LEGACY_ID)).toBe(true);
        const row = await pages.getPageRow(LEGACY_ID, 5);
        expect(row).not.toBeNull();
        expect(await pages.bookHasContent(LEGACY_ID)).toBe(true);
    });

    it("reads a bucket >= 100 where both spellings coincide (book/942/10942.db)", async () => {
        expect(await pages.hasBook(HIGH_ID)).toBe(true);
        expect(await pages.bookHasContent(HIGH_ID)).toBe(true);
    });

    it("still reports a truly missing book as not downloaded", async () => {
        expect(await pages.hasBook(MISSING_ID)).toBe(false);
        expect(await pages.bookHasContent(MISSING_ID)).toBe(false);
        expect(await pages.getPageRow(MISSING_ID, 1)).toBeNull();
    });
});
