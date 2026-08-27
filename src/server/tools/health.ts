import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { Helper } from "../helper.js";
import { VERSION } from "../constants.js";
import { errorCode, formatErrorMessage } from "../errors.js";
import type { PageStore } from "../pages.js";
import type { ShamelaPaths } from "../paths.js";
import { ResponseFormatInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { healthLabels } from "../i18n/tools/health.js";

export const healthInputShape = { ...ResponseFormatInput };
export const healthInput = z.object(healthInputShape).strict();

export interface HealthOutput {
    server_version: string;
    status: "ok" | "degraded" | "not_started";
    /**
     * Present only when the extension could not start at all: the reason, in
     * the user's language, plus what to do about it. Issue #42 — an install
     * Shamela never upgraded fails every tool, and this is the tool that has
     * to say why rather than fail with them.
     */
    startup_error?: { code: string; message: string; install_root: string | null };
    /**
     * Which Shamela installation is actually being read, and how it was found.
     *
     * Resolution can recover from a bad explicit setting by falling back to
     * the registry and the common locations — deliberately, so a typo in the
     * settings field does not brick the extension. But a recovery nobody is
     * told about is how someone with two Shamela copies reads from the one
     * they did not ask for. This is the only place that says which library
     * answered, so it has to say it.
     */
    install_root: string | null;
    install_root_source: "setting" | "registry" | "auto" | null;
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
    /**
     * Verse indexes built from tafsir books' own chapter titles. `books_low`
     * is the number that were built and then judged untrustworthy — those
     * never return a page, so a high count here explains missing locations.
     */
    aya_index: {
        cache_dir: string;
        books_indexed: number;
        books_high: number;
        books_medium: number;
        books_low: number;
        total_entries: number;
        last_build_ms: number | null;
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
    catalog: Catalog | null,
    pages: PageStore | null,
    helper: Helper | null,
    ayaIndex: { stats(): HealthOutput["aya_index"] } | null,
    args: z.infer<typeof healthInput>,
    /** Set when createBackend threw: what failed, and how far setup got. */
    diagnosis?: { startupError: unknown; paths: { installRoot: string } | null },
    /**
     * The resolved paths, for saying which library is being read. Trailing and
     * optional so the ten existing callers stand unchanged; absent on the
     * not-started path, where resolution itself may be what failed.
     */
    paths?: ShamelaPaths | null,
): Promise<RenderedResponse<HealthOutput>> {
    if (diagnosis || catalog === null || pages === null) {
        return notStarted(catalog, diagnosis, args);
    }
    const downloaded = catalog.downloadedBookIds();
    // Computed over the whole library from sets already in memory — no disk
    // access — so this is an exact count, not something a sample might miss.
    const flaggedMissing = catalog.flaggedFileMissingIds();
    const orphans = catalog.orphanFileIds();
    // The reader's language, for the notes below. They travel in
    // structuredContent as well as in the markdown, but they are sentences a
    // person reads rather than values a caller branches on — every machine fact
    // behind them is already in a typed field.
    const L = pick(healthLabels);
    const notes: string[] = [];
    // The most load-bearing note goes first: the user pointed the extension at
    // a folder, the folder was rejected, and a different library answered. The
    // fallback itself is right — a typo must not brick the extension — but the
    // field test proved the recovery was invisible: the reader had no way to
    // learn, from any surface, that they were not reading the library they
    // named (issue #42's cousin, found by pointing the setting at an empty
    // folder and seeing nothing happen at all).
    if (paths?.rejectedSetting) {
        notes.push(
            L.noteSettingRejected(paths.rejectedSetting.path, paths.rejectedSetting.reason, paths.installRoot),
        );
    }
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
        if (spot.readable === 0) notes.push(L.noteNoneReadable);
        // Ids, so String() and a separator that follows the language.
        else if (unreadable.length)
            notes.push(L.noteSomeUnreadable(unreadable.map(String).join(L.idSeparator)));
    } else {
        notes.push(L.noteNoDownloads);
    }
    if (flaggedMissing.length) notes.push(L.noteFlaggedMissing(num(flaggedMissing.length)));
    if (catalog.diskScanFellBack()) notes.push(L.noteDiskScanFellBack);
    notes.push(L.noteEngineWarmup);

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
                    // A smoke query wants a number, not a distribution; the
                    // rollup would walk every match in the library for it.
                    options: { skip_coverage: true },
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
            if (searchIndex.page_docs === 0) notes.push(L.noteIndexEmpty);
            else if (probeHits === 0 && downloaded.size > 0) notes.push(L.noteProbeNoHits(PROBE_QUERY));
        } catch (e) {
            searchIndex = {
                page_docs: null,
                book_docs: null,
                author_docs: null,
                probe_query: PROBE_QUERY,
                probe_hits: null,
                error: e instanceof Error ? e.message : String(e),
            };
            notes.push(L.noteEngineDown);
        }
    }

    const status: HealthOutput["status"] =
        catalog.bookCount() > 0 && (spot ? spot.readable > 0 : true) ? "ok" : "degraded";

    const out: HealthOutput = {
        server_version: VERSION,
        status,
        install_root: paths?.installRoot ?? null,
        install_root_source: paths?.installRootSource ?? null,
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
        aya_index: ayaIndex?.stats() ?? null,
        notes,
    };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(healthLabels);
        const lines = [
            header(1, L.heading(data.status === "ok" ? L.ok : L.degraded)),
            L.serverVersion(data.server_version),
            L.counts(num(data.catalog_books), num(data.catalog_authors), num(data.categories)),
            L.downloaded(num(data.downloaded_books)),
        ];
        // Which library answered, and on whose word. The paths stay Latin —
        // they are typed back into the settings field.
        if (data.install_root && data.install_root_source) {
            const sourceLabel =
                data.install_root_source === "setting"
                    ? L.sourceSetting
                    : data.install_root_source === "registry"
                      ? L.sourceRegistry
                      : L.sourceAuto;
            lines.push(L.installRootUsed(data.install_root, sourceLabel));
        }
        if (data.flagged_file_missing)
            lines.push(L.flaggedMissing(num(data.flagged_file_missing)));
        if (data.orphan_files)
            lines.push(L.orphanFiles(num(data.orphan_files)));
        if (data.disk_scan_fell_back)
            lines.push(L.diskScanFellBack);
        if (data.readable_spot_check)
            lines.push(
                L.spotCheck(
                    num(data.readable_spot_check.readable),
                    num(data.readable_spot_check.sampled),
                    data.readable_spot_check.unreadable_book_ids.length
                        ? L.unreadableIds(data.readable_spot_check.unreadable_book_ids.map(String).join(L.idSeparator))
                        : "",
                ),
            );
        if (data.search_index) {
            const si = data.search_index;
            lines.push(
                L.searchIndex(
                    (si.page_docs === null ? L.unavailable : L.pageDocs(num(si.page_docs))) +
                        (si.book_docs !== null ? L.bookDocs(num(si.book_docs)) : "") +
                        (si.author_docs !== null ? L.authorDocs(num(si.author_docs)) : ""),
                ),
            );
            lines.push(
                L.probe(
                    si.probe_query,
                    si.error
                        ? L.probeFailed(si.error)
                        : si.probe_hits === null
                          ? L.unavailable
                          : L.probeHits(num(si.probe_hits)),
                ),
            );
        }
        if (data.notes.length) {
            lines.push("", L.notesHeading);
            for (const n of data.notes) lines.push(`- ${n}`);
        }
        return lines.join("\n");
    });
}

/**
 * The answer when the extension never started.
 *
 * Reports what could still be determined — the install it found, whether the
 * catalogue opened, how many books are there — and names the failure with the
 * step the user has to take. Everything the ordinary report would compute from
 * the search engine is absent, and said to be absent rather than shown as zero:
 * a zero here would read as "your library is empty", which is the misreading
 * this whole tool exists to prevent.
 */
function notStarted(
    catalog: Catalog | null,
    diagnosis: { startupError: unknown; paths: { installRoot: string } | null } | undefined,
    args: z.infer<typeof healthInput>,
): RenderedResponse<HealthOutput> {
    const err = diagnosis?.startupError;
    const code = errorCode(err);
    const out: HealthOutput = {
        server_version: VERSION,
        status: "not_started",
        startup_error: {
            code,
            message: formatErrorMessage(err),
            install_root: diagnosis?.paths?.installRoot ?? null,
        },
        install_root: diagnosis?.paths?.installRoot ?? null,
        install_root_source: null,
        catalog_books: catalog?.bookCount() ?? 0,
        catalog_authors: catalog?.authorCount() ?? 0,
        categories: catalog?.categoryCount() ?? 0,
        downloaded_books: catalog?.downloadedBookIds().size ?? 0,
        flagged_books: 0,
        flagged_file_missing: 0,
        orphan_files: 0,
        disk_scan_fell_back: false,
        readable_spot_check: null,
        search_index: null,
        aya_index: null,
        notes: [],
    };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(healthLabels);
        const lines = [header(1, L.notStartedHeading)];
        lines.push(L.notStartedLead(data.startup_error?.code ?? ""));
        lines.push("");
        lines.push(`> ${data.startup_error?.message ?? ""}`);
        lines.push("");
        if (data.startup_error?.install_root) {
            lines.push(L.installRootLine(data.startup_error.install_root));
        }
        if (catalog) {
            lines.push(L.catalogStillReadable(num(data.catalog_books), num(data.downloaded_books)));
        } else {
            lines.push(L.catalogUnreadable);
        }
        return lines.join("\n");
    });
}
