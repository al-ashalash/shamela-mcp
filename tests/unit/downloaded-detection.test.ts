/**
 * What counts as a downloaded book.
 *
 * The reported failure: a library that arrived by copying a folder or restoring
 * a backup has every book file in place and none of master.db's `major_ondisk`
 * flags set. The extension read only the flag, so it announced zero downloaded
 * books and refused to open any of them — while Shamela itself opened them
 * normally. These tests fix the new rule in place: the file decides.
 *
 * All of it runs on a synthetic library in a temp folder, so it needs no
 * Shamela install and runs in CI.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { DiskIndex } from "../../src/server/diskIndex.js";
import { resolveBookPath } from "../../src/server/pages.js";

let root: string;

function writeBook(bucket: string, id: number): void {
    const dir = path.join(root, "book", bucket);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.db`), "not a real sqlite file");
}

beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "shamela-disk-index-"));
    writeBook("009", 9); // padded bucket
    writeBook("7", 7); // legacy unpadded bucket
    writeBook("942", 10_942); // bucket >= 100
    writeBook("000", 5_000); // the padStart edge
    fs.mkdirSync(path.join(root, "book", "empty-bucket"), { recursive: true });
    // Files that are not books must be ignored.
    fs.writeFileSync(path.join(root, "book", "942", "notes.txt"), "x");
    fs.writeFileSync(path.join(root, "book", "942", "backup.db.bak"), "x");
});

afterAll(() => {
    try {
        fs.rmSync(root, { recursive: true, force: true });
    } catch {
        /* best-effort */
    }
});

describe("DiskIndex", () => {
    it("finds books under every bucket spelling, reading ids from file names", () => {
        const idx = new DiskIndex(root);
        const res = idx.scan();
        expect([...res.ids].sort((a, b) => a - b)).toEqual([7, 9, 5_000, 10_942]);
        // Reading the id from the name is what makes this immune to the bucket
        // padding problem: it never has to guess the folder spelling.
        expect(idx.has(9)).toBe(true);
        expect(idx.has(5_000)).toBe(true);
    });

    it("ignores files that are not <id>.db", () => {
        const idx = new DiskIndex(root);
        idx.scan();
        expect(idx.ids.size).toBe(4);
    });

    it("reports an empty scan rather than throwing when the folder is unreadable", () => {
        const idx = new DiskIndex(path.join(root, "no-such-place"));
        const res = idx.scan();
        expect(res.ids.size).toBe(0);
        expect(res.buckets).toBe(0);
        expect(idx.scanned).toBe(true);
    });

    it("picks up a book that appears after the scan, via a direct check", () => {
        const idx = new DiskIndex(root);
        idx.scan();
        expect(idx.has(4_242)).toBe(false);

        writeBook("242", 4_242);
        // The scan is stale, but the negative path confirms against the disk —
        // this is what lets a just-downloaded book work without a restart.
        expect(idx.confirm(4_242)).toBe(true);
        expect(idx.has(4_242)).toBe(true);
        expect(idx.confirm(999_999)).toBe(false);
    });

    it("reports what changed on a rescan", () => {
        const idx = new DiskIndex(root);
        idx.scan();
        writeBook("777", 3_777);
        const { added, removed } = idx.rescan();
        expect(added).toContain(3_777);
        expect(removed).toEqual([]);
    });
});

describe("resolveBookPath", () => {
    it("prefers the padded spelling and falls back to the legacy one", () => {
        expect(resolveBookPath(root, 9)).toContain(path.join("book", "009", "9.db"));
        expect(resolveBookPath(root, 7)).toContain(path.join("book", "7", "7.db"));
        expect(resolveBookPath(root, 5_000)).toContain(path.join("book", "000", "5000.db"));
        expect(resolveBookPath(root, 123_456)).toBeNull();
    });
});
