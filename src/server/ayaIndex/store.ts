/**
 * Holding built verse indexes: in memory for the session, on disk between them.
 *
 * The cache lives in the user's own application-data folder, never inside the
 * Shamela install — that folder is read-only to this extension without
 * exception, and a cache is a write.
 *
 * Three things invalidate an entry, and all three matter:
 *   - the book file's size or timestamp changed (it was re-downloaded)
 *   - the schema version changed (the parser improved; old output is suspect)
 *   - the catalog was reloaded (the library changed under the session)
 *
 * Failing to write the cache is not an error. The index is already built and
 * usable for the session; a read-only disk or a missing folder should degrade
 * to "slower next time", not to a failed request.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
    AYA_INDEX_BUILD_BUDGET_PER_CALL,
    AYA_INDEX_SCHEMA_VERSION,
    VERSION,
} from "../constants.js";
import type { Helper } from "../helper.js";
import { resolveBookPath, type PageStore } from "../pages.js";
import { buildBookIndex, TitlesNotReadyError, type BookAyaIndex } from "./build.js";

/** Where a cache may live. Never under the Shamela install. */
export function resolveCacheDir(): string {
    const override = process.env.SHAMELA_CACHE_DIR?.trim();
    if (override) return path.join(override, "aya-index");
    if (process.platform === "win32") {
        const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
        return path.join(base, "shamela-mcp", "aya-index");
    }
    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Application Support", "shamela-mcp", "aya-index");
    }
    const xdg = process.env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), ".cache");
    return path.join(xdg, "shamela-mcp", "aya-index");
}

export type IndexAvailability =
    | { state: "ready"; index: BookAyaIndex }
    /** The book is on disk but the search engine has not read its titles yet. */
    | { state: "pending" }
    /** Not built yet, and this call's build budget is spent. */
    | { state: "not_built" }
    /** Building failed for a reason that is not going to fix itself. */
    | { state: "unavailable"; reason: string };

export interface AyaIndexStats {
    cache_dir: string;
    books_indexed: number;
    books_high: number;
    books_medium: number;
    books_low: number;
    total_entries: number;
    last_build_ms: number | null;
}

export class AyaIndexStore {
    private readonly memory = new Map<number, BookAyaIndex>();
    private readonly inFlight = new Map<number, Promise<BookAyaIndex>>();
    private readonly failed = new Map<number, string>();
    private readonly cacheDir: string;
    private lastBuildMs: number | null = null;
    /** Reset per tool call so one request cannot index a whole library. */
    private budget = AYA_INDEX_BUILD_BUDGET_PER_CALL;

    constructor(
        private readonly databaseRoot: string,
        private readonly pages: PageStore,
        cacheDir = resolveCacheDir(),
    ) {
        this.cacheDir = cacheDir;
    }

    /** Start a fresh build allowance; called once per tool invocation. */
    resetBudget(): void {
        this.budget = AYA_INDEX_BUILD_BUDGET_PER_CALL;
    }

    /** Drop in-memory indexes. The disk cache stays; its fingerprints guard it. */
    invalidate(bookIds?: number[]): void {
        if (!bookIds) {
            this.memory.clear();
            this.failed.clear();
            return;
        }
        for (const id of bookIds) {
            this.memory.delete(id);
            this.failed.delete(id);
        }
    }

    private sourceOf(bookId: number): { size: number; mtime_ms: number } | null {
        const p = resolveBookPath(this.databaseRoot, bookId);
        if (!p) return null;
        try {
            const st = fs.statSync(p);
            return { size: st.size, mtime_ms: st.mtimeMs };
        } catch {
            return null;
        }
    }

    private cachePath(bookId: number): string {
        return path.join(this.cacheDir, `${bookId}.json`);
    }

    private readCache(bookId: number, source: { size: number; mtime_ms: number }): BookAyaIndex | null {
        try {
            const raw = fs.readFileSync(this.cachePath(bookId), "utf8");
            const parsed = JSON.parse(raw) as BookAyaIndex;
            if (parsed.schema !== AYA_INDEX_SCHEMA_VERSION) return null;
            if (parsed.builder !== VERSION) return null;
            if (parsed.source?.size !== source.size || parsed.source?.mtime_ms !== source.mtime_ms) {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    private writeCache(index: BookAyaIndex): void {
        try {
            fs.mkdirSync(this.cacheDir, { recursive: true });
            const target = this.cachePath(index.book_id);
            const tmp = `${target}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(index), "utf8");
            fs.renameSync(tmp, target);
        } catch {
            // Not fatal: the index is in memory and the session proceeds.
        }
    }

    /** What we already know, without building anything. */
    peek(bookId: number): IndexAvailability {
        const mem = this.memory.get(bookId);
        if (mem) return { state: "ready", index: mem };
        const failure = this.failed.get(bookId);
        if (failure === "pending") return { state: "pending" };
        if (failure) return { state: "unavailable", reason: failure };
        const source = this.sourceOf(bookId);
        if (!source) return { state: "unavailable", reason: "book file not found" };
        const cached = this.readCache(bookId, source);
        if (cached) {
            this.memory.set(bookId, cached);
            return { state: "ready", index: cached };
        }
        return { state: "not_built" };
    }

    /** Get an index, building it if the call still has budget. */
    async get(helper: Helper, bookId: number): Promise<IndexAvailability> {
        const known = this.peek(bookId);
        if (known.state !== "not_built") return known;
        if (this.budget <= 0) return { state: "not_built" };

        const running = this.inFlight.get(bookId);
        if (running) {
            try {
                return { state: "ready", index: await running };
            } catch {
                return this.peek(bookId);
            }
        }

        const source = this.sourceOf(bookId);
        if (!source) return { state: "unavailable", reason: "book file not found" };

        this.budget--;
        const started = Date.now();
        const promise = buildBookIndex(helper, this.pages, bookId, source);
        this.inFlight.set(bookId, promise);
        try {
            const index = await promise;
            this.lastBuildMs = Date.now() - started;
            this.memory.set(bookId, index);
            this.writeCache(index);
            return { state: "ready", index };
        } catch (e) {
            if (e instanceof TitlesNotReadyError) {
                this.failed.set(bookId, "pending");
                return { state: "pending" };
            }
            const reason = e instanceof Error ? e.message : String(e);
            this.failed.set(bookId, reason);
            return { state: "unavailable", reason };
        } finally {
            this.inFlight.delete(bookId);
        }
    }

    stats(): AyaIndexStats {
        let high = 0;
        let medium = 0;
        let low = 0;
        let entries = 0;
        const count = (idx: BookAyaIndex): void => {
            if (idx.confidence === "high") high++;
            else if (idx.confidence === "medium") medium++;
            else low++;
            entries += idx.coverage.ayat;
        };
        for (const idx of this.memory.values()) count(idx);

        // The disk cache too, not only what this session has already loaded.
        // Counting `memory` alone made health report the index as EMPTY on the
        // first call after startup — measured: books_indexed 0, then 25 a few
        // seconds later with no build in between, while all 25 cache files had
        // sat on disk for three days. The tool whose own advice is "run me
        // first" was wrong precisely on the first run.
        //
        // A file is counted when this build would accept its generation
        // (schema + builder). The book-file fingerprint is deliberately NOT
        // checked here: that needs a stat of every book, and a stale entry is
        // still built work — it revalidates and rebuilds on the next use.
        let booksSeen = this.memory.size;
        try {
            for (const name of fs.readdirSync(this.cacheDir)) {
                const m = /^(\d+)\.json$/.exec(name);
                if (!m) continue;
                const id = Number(m[1]);
                if (this.memory.has(id)) continue;
                try {
                    const parsed = JSON.parse(
                        fs.readFileSync(path.join(this.cacheDir, name), "utf8"),
                    ) as BookAyaIndex;
                    if (parsed.schema !== AYA_INDEX_SCHEMA_VERSION) continue;
                    if (parsed.builder !== VERSION) continue;
                    booksSeen++;
                    count(parsed);
                } catch {
                    // A half-written or corrupt file is not an indexed book.
                }
            }
        } catch {
            // No cache directory yet — nothing on disk to count.
        }

        return {
            cache_dir: this.cacheDir,
            books_indexed: booksSeen,
            books_high: high,
            books_medium: medium,
            books_low: low,
            total_entries: entries,
            last_build_ms: this.lastBuildMs,
        };
    }
}
