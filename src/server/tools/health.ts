import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { Helper } from "../helper.js";
import { VERSION } from "../constants.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header, arabize } from "../format.js";

export const healthInputShape = { ...ResponseFormatInput };
export const healthInput = z.object(healthInputShape).strict();

export interface HealthOutput {
    server_version: string;
    status: "ok" | "degraded";
    catalog_books: number;
    catalog_authors: number;
    categories: number;
    /** Books whose file is actually present on disk — the authority. */
    downloaded_books: number;
    /** Books master.db flags as downloaded; differs from the above when the two disagree. */
    flagged_books: number;
    /** Flagged but with no file: an interrupted download or a moved library folder. */
    flagged_file_missing: number;
    /** Book files with no catalog row. Diagnostic only; never listed as books. */
    orphan_files: number;
    /** True when the book folder could not be read and the flags were used instead. */
    disk_scan_fell_back: boolean;
    /** Spot-check over a small sample of downloaded books: how many are actually readable? */
    readable_spot_check: { sampled: number; readable: number; unreadable_book_ids: number[] } | null;
    /**
     * Document counts in Shamela's Lucene indexes, plus a query that is known to
     * match. A search returning nothing looks the same whether the word is
     * absent or the whole index is unreachable — this separates the two without
     * the user having to guess.
     */
    search_index: {
        page_docs: number | null;
        book_docs: number | null;
        author_docs: number | null;
        probe_query: string;
        probe_hits: number | null;
        error: string | null;
    } | null;
    notes: string[];
}

/**
 * A word that is common in the corpus and carries a hamza on a seat. Both
 * properties matter: it proves the index answers at all, and it exercises the
 * normalization path where a mismatch used to return a silent zero.
 */
const PROBE_QUERY = "المسائل";

const SPOT_SAMPLE = 5;

/**
 * (#14): a cheap
 * self-diagnostic. Reaching this handler at all proves the backend booted
 * (catalog loaded); the spot-check distinguishes "server fine" from
 * "library path / content problems" when users report missing/empty tools.
 */
export async function runHealth(
    catalog: Catalog,
    pages: PageStore,
    helper: Helper | null,
    args: z.infer<typeof healthInput>,
): Promise<RenderedResponse<HealthOutput>> {
    const downloaded = catalog.downloadedBookIds();
    // Computed over the whole library from sets already in memory — no disk
    // access — so this is an exact count, not something a sample might miss.
    const flaggedMissing = catalog.flaggedFileMissingIds();
    const orphans = catalog.orphanFileIds();
    const notes: string[] = [];
    let spot: HealthOutput["readable_spot_check"] = null;

    // Evenly-spread sample across the whole downloaded set — the low-id head of
    // master.db clusters unreadable placeholder rows, so a head-only sample lies.
    const all = Array.from(downloaded).sort((a, b) => a - b);
    const sampleIds = all.length <= SPOT_SAMPLE
        ? all
        : Array.from({ length: SPOT_SAMPLE }, (_, i) => all[Math.floor((i * (all.length - 1)) / (SPOT_SAMPLE - 1))]!)
              .filter((v, i, arr) => arr.indexOf(v) === i);
    if (sampleIds.length) {
        // Every id here has a file on disk, so anything unreadable is a
        // page-less (image/scan-only) title. Books flagged without a file are
        // counted separately and exactly, above.
        const unreadable: number[] = [];
        for (const id of sampleIds) {
            if (!(await pages.bookHasContent(id))) unreadable.push(id);
        }
        spot = { sampled: sampleIds.length, readable: sampleIds.length - unreadable.length, unreadable_book_ids: unreadable };
        if (spot.readable === 0)
            notes.push(
                "NONE of the sampled downloaded books have readable pages — the Shamela database path may be wrong, or downloads are incomplete",
            );
        else if (unreadable.length)
            notes.push(
                `downloaded but carrying no text pages (ids: ${unreadable.join(", ")}) — image/scan-only titles, not a server fault; do not quote from them`,
            );
    } else {
        notes.push("no downloaded books found — page searches will return nothing until books are downloaded in Shamela");
    }
    if (flaggedMissing.length)
        notes.push(
            `${flaggedMissing.length} book(s) are flagged as downloaded but have no file on disk — interrupted downloads, or the library folder moved; they are excluded from the counts above`,
        );
    if (catalog.diskScanFellBack())
        notes.push(
            "the book folder could not be read, so these counts come from master.db's flags rather than the files themselves — check the Shamela path",
        );
    notes.push("the Java search engine warms up lazily; run a small search to exercise it end-to-end");

    // Ask the search engine what it holds. `ping` already reports the document
    // counts, and one probe query turns "the index is open" into "the index
    // answers".
    let searchIndex: HealthOutput["search_index"] = null;
    if (helper) {
        try {
            const pong = await helper.ping(15_000);
            let probeHits: number | null = null;
            let probeError: string | null = null;
            try {
                const env = await helper.request<{ total_hits?: number }>("search_pages", {
                    query: PROBE_QUERY,
                    max_results: 1,
                    offset: 0,
                    options: {},
                });
                probeHits = env.total_hits ?? 0;
            } catch (e) {
                probeError = e instanceof Error ? e.message : String(e);
            }
            searchIndex = {
                page_docs: pong.page_docs ?? null,
                book_docs: pong.book_docs ?? null,
                author_docs: pong.author_docs ?? null,
                probe_query: PROBE_QUERY,
                probe_hits: probeHits,
                error: probeError,
            };
            if (searchIndex.page_docs === 0)
                notes.push(
                    "the page index reports zero documents — Shamela has not built its search index yet, or the library path points somewhere without one",
                );
            else if (probeHits === 0 && downloaded.size > 0)
                notes.push(
                    `the search index is open but a word as common as «${PROBE_QUERY}» matched nothing — searches will look empty rather than broken; please report this`,
                );
        } catch (e) {
            searchIndex = {
                page_docs: null,
                book_docs: null,
                author_docs: null,
                probe_query: PROBE_QUERY,
                probe_hits: null,
                error: e instanceof Error ? e.message : String(e),
            };
            notes.push("the search engine did not respond — searches will fail until it starts");
        }
    }

    const status: HealthOutput["status"] =
        catalog.bookCount() > 0 && (spot ? spot.readable > 0 : true) ? "ok" : "degraded";

    const out: HealthOutput = {
        server_version: VERSION,
        status,
        catalog_books: catalog.bookCount(),
        catalog_authors: catalog.authorCount(),
        categories: catalog.categoryCount(),
        downloaded_books: downloaded.size,
        flagged_books: catalog.flaggedBookCount(),
        flagged_file_missing: flaggedMissing.length,
        orphan_files: orphans.length,
        disk_scan_fell_back: catalog.diskScanFellBack(),
        readable_spot_check: spot,
        search_index: searchIndex,
        notes,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [
            header(1, `فحص خادم الشاملة — ${data.status === "ok" ? "سليم ✅" : "متعثر ⚠️"}`),
            `- **نسخة الخادم**: ${data.server_version}`,
            `- **كتب الفهرس**: ${arabize(data.catalog_books)} — **المؤلفون**: ${arabize(data.catalog_authors)} — **التصنيفات**: ${arabize(data.categories)}`,
            `- **الكتب المنزَّلة**: ${arabize(data.downloaded_books)} (ملفاتها موجودة على القرص)`,
        ];
        if (data.flagged_file_missing)
            lines.push(
                `- **معلَّمة في الفهرس بلا ملف**: ${arabize(data.flagged_file_missing)} — تنزيل مبتور أو مجلد مكتبة مُنقَل`,
            );
        if (data.orphan_files)
            lines.push(`- **ملفات كتب خارج الفهرس**: ${arabize(data.orphan_files)}`);
        if (data.disk_scan_fell_back)
            lines.push("- ⚠️ **تعذَّرت قراءة مجلد الكتب**؛ الأعداد أعلاه من علامات الفهرس لا من الملفات");
        if (data.readable_spot_check)
            lines.push(
                `- **عيّنة قابلية القراءة**: ${arabize(data.readable_spot_check.readable)} من ${arabize(data.readable_spot_check.sampled)} مقروءة${data.readable_spot_check.unreadable_book_ids.length ? ` (غير المقروءة: ${data.readable_spot_check.unreadable_book_ids.join("، ")})` : ""}`,
            );
        if (data.search_index) {
            const si = data.search_index;
            lines.push(
                `- **فهرس البحث**: ${si.page_docs === null ? "غير متاح" : `${arabize(si.page_docs)} وثيقة صفحات`}` +
                    (si.book_docs !== null ? ` — ${arabize(si.book_docs)} كتب` : "") +
                    (si.author_docs !== null ? ` — ${arabize(si.author_docs)} مؤلفين` : ""),
            );
            lines.push(
                `- **استعلام تجريبي** «${si.probe_query}»: ${
                    si.error ? `أخفق (${si.error})` : si.probe_hits === null ? "غير متاح" : `${arabize(si.probe_hits)} نتيجة`
                }`,
            );
        }
        if (data.notes.length) {
            lines.push("", "**ملاحظات**:");
            for (const n of data.notes) lines.push(`- ${n}`);
        }
        return lines.join("\n");
    });
}
