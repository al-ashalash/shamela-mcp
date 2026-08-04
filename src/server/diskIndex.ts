/**
 * Which books are actually on disk.
 *
 * `master.db` carries a `major_ondisk` flag per book, and until now that flag
 * decided both the "downloaded books" count and whether every reading tool
 * would open a book at all. The flag is set by Shamela when it downloads a
 * book — so a library that arrived by copying a folder or restoring a backup
 * has the files but none of the flags, and the extension reported zero books
 * and refused to read any of them while Shamela itself opened them normally.
 *
 * The file's existence is therefore the authority, and the flag is kept only as
 * an index hint worth reporting when the two disagree.
 *
 * Reading the ids from the FILE NAMES rather than probing a computed path also
 * makes this immune to the bucket-spelling problem: it never has to guess
 * whether a folder is zero-padded.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { resolveBookPath } from "./pages.js";

export interface DiskScanResult {
    ids: Set<number>;
    buckets: number;
    /**
     * Whether the book folder could be listed at all. An empty but readable
     * folder is a real (empty) library; an unreadable one is a broken path or a
     * disconnected drive, and the two must not be treated alike.
     */
    rootReadable: boolean;
    ms: number;
}

const BOOK_FILE = /^(\d+)\.db$/;

export class DiskIndex {
    private _ids = new Set<number>();
    private _scanned = false;
    private _lastScanAt = 0;
    private _lastBuckets = 0;
    private _rootReadable = false;

    constructor(private readonly databaseRoot: string) {}

    get ids(): ReadonlySet<number> {
        return this._ids;
    }
    get scanned(): boolean {
        return this._scanned;
    }
    get lastScanAt(): number {
        return this._lastScanAt;
    }
    /** Bucket folders seen in the last scan. */
    get buckets(): number {
        return this._lastBuckets;
    }

    /** False when the book folder itself could not be listed. */
    get rootReadable(): boolean {
        return this._rootReadable;
    }

    has(bookId: number): boolean {
        return this._ids.has(bookId);
    }

    /** Walk `database/book/<bucket>/<id>.db` and collect the ids. */
    scan(): DiskScanResult {
        const started = Date.now();
        const root = path.join(this.databaseRoot, "book");
        const ids = new Set<number>();
        let buckets = 0;
        let rootReadable = false;
        try {
            const top = fs.readdirSync(root, { withFileTypes: true });
            rootReadable = true;
            for (const bucket of top) {
                if (!bucket.isDirectory()) continue;
                buckets++;
                let entries: fs.Dirent[];
                try {
                    entries = fs.readdirSync(path.join(root, bucket.name), { withFileTypes: true });
                } catch {
                    continue; // an unreadable bucket must not abort the whole scan
                }
                for (const entry of entries) {
                    if (!entry.isFile()) continue;
                    const m = BOOK_FILE.exec(entry.name);
                    if (m) ids.add(Number(m[1]));
                }
            }
        } catch {
            // The book folder itself is unreadable (wrong path, permissions, a
            // disconnected network drive). Report an empty scan; the caller
            // falls back to the catalog flags rather than declaring the user's
            // library gone.
        }
        this._ids = ids;
        this._scanned = true;
        this._lastScanAt = Date.now();
        this._lastBuckets = buckets;
        this._rootReadable = rootReadable;
        return { ids, buckets, rootReadable, ms: this._lastScanAt - started };
    }

    /** Re-scan and report what changed since the previous scan. */
    rescan(): { added: number[]; removed: number[] } {
        const before = this._ids;
        const after = this.scan().ids;
        const added: number[] = [];
        const removed: number[] = [];
        for (const id of after) if (!before.has(id)) added.push(id);
        for (const id of before) if (!after.has(id)) removed.push(id);
        return { added, removed };
    }

    /**
     * Check one book directly. Costs a stat, so it is meant for the negative
     * path only — confirming a book the scan did not know about, which is how a
     * book that appeared after the scan (a copied file, a fresh download) gets
     * picked up without waiting for a reload.
     */
    confirm(bookId: number): boolean {
        if (this._ids.has(bookId)) return true;
        if (resolveBookPath(this.databaseRoot, bookId) === null) return false;
        this._ids.add(bookId);
        return true;
    }

    /** Seed for tests: use a known id set instead of touching the filesystem. */
    static fromIds(ids: Iterable<number>, databaseRoot = ""): DiskIndex {
        const idx = new DiskIndex(databaseRoot);
        idx._ids = new Set(ids);
        idx._scanned = true;
        idx._lastScanAt = Date.now();
        idx._lastBuckets = idx._ids.size ? 1 : 0;
        idx._rootReadable = true;
        return idx;
    }
}
