/**
 * What to do about a book the research needs but the machine does not have.
 *
 * This comes up constantly and always the same way: a downloaded book cites
 * another one, or an editor's footnote points at a source, and the search that
 * follows returns nothing. Nothing about that empty result says whether the
 * work is absent from the library, absent from Shamela altogether, or sitting
 * one click away in the app.
 *
 * The catalogue already knows. Every book Shamela publishes is in `master.db`
 * with a flag for whether it can be downloaded, and after the on-disk detection
 * work we know exactly which files are present. So the answer is a lookup, and
 * this tool turns it into an instruction: download it from the app (here is its
 * number and page), or look elsewhere because Shamela does not offer it.
 *
 * Deliberately offline. The extension does not fetch books and does not talk to
 * any server — it composes the shamela.ws link as text and leaves both the
 * fetching and the decision to the user, inside the app that was built for it.
 */

import { z } from "zod";

import { normalizeArabic } from "../arabic.js";
import { SHAMELA_WEB } from "../constants.js";
import type { Catalog } from "../catalog.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { suggestDownloadLabels } from "../i18n/tools/suggestDownload.js";
import { ResponseFormatInput } from "../schemas.js";

export const suggestDownloadInputShape = {
    query: z
        .string()
        .trim()
        .min(2)
        .optional()
        .describe(
            "Title or author to look for in Shamela's full catalogue, downloaded or not. Use when a book was mentioned by name — in a citation, a footnote, or by the user.",
        ),
    book_ids: z
        .array(z.number().int().positive())
        .max(20)
        .optional()
        .describe("Specific catalogue ids to report on. Use when the id is already known."),
    category_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Narrow a title/author search to one category. See shamela_list_categories."),
    limit: z.number().int().min(1).max(50).default(10),
    ...ResponseFormatInput,
};

export const suggestDownloadInput = z.object(suggestDownloadInputShape).strict();

export type DownloadStatus =
    /** Its file is on this machine; searchable and readable now. */
    | "downloaded"
    /** In the catalogue and offered for download — the actionable case. */
    | "available_to_download"
    /** In the catalogue but Shamela does not offer it for download. */
    | "in_catalogue_only";

export interface SuggestDownloadCandidate {
    book_id: number;
    book_name: string;
    author_name: string | null;
    death_year: number | null;
    category: string | null;
    book_date: number | null;
    status: DownloadStatus;
    /** Its page on shamela.ws — composed locally, never fetched. */
    link: string;
}

export interface SuggestDownloadOutput {
    query: string | null;
    total: number;
    returned: number;
    downloaded_count: number;
    available_count: number;
    unavailable_count: number;
    results: SuggestDownloadCandidate[];
    /** What to do next, in the user's own terms. */
    next_steps: string[];
    notes: string[];
}

const BOOK_PAGE = (id: number): string => `${SHAMELA_WEB}/book/${id}`;

/**
 * Match a title or author name the way someone would type it from memory.
 *
 * Runs both sides through the same normalization the search tools use, so
 * hamza spelling and diacritics do not decide whether a book is found. The
 * definite article is also tried both ways: someone looking for «المغني» is
 * not helped by a catalogue that files the book as «مغني المحتاج».
 */
function matches(hay: string, needleWords: string[]): boolean {
    const h = normalizeArabic(hay);
    // i18n:arabic-data — matching a title with or without its «ال»; the
    // article is part of the comparison, not part of the interface.
    return needleWords.every((w) => h.includes(w) || (w.startsWith("ال") && h.includes(w.slice(2))));
}

/** Prepare the query words once: normalized, article-aware, noise dropped. */
function queryWords(query: string): string[] {
    return normalizeArabic(query)
        .split(/\s+/)
        .filter((w) => w.length > 1);
}

export function runSuggestDownload(
    catalog: Catalog,
    args: z.infer<typeof suggestDownloadInput>,
): RenderedResponse<SuggestDownloadOutput> {
    // `next_steps` and `notes` ride in `structuredContent`, but they are prose a
    // reader reads — the counts and the `status` codes are what a caller reads.
    // So they come from the slice and follow the language in force, and the
    // slice is picked out here rather than in the renderer because they are
    // written while the answer is being assembled.
    const L = pick(suggestDownloadLabels);
    const notes: string[] = [];
    const seen = new Set<number>();
    const matched: SuggestDownloadCandidate[] = [];

    const describe = (bookId: number): SuggestDownloadCandidate | null => {
        const rec = catalog.bookRecord(bookId);
        if (!rec) return null;
        const author = catalog.bookAuthors(rec)[0] ?? null;
        const status: DownloadStatus = catalog.isDownloaded(bookId)
            ? "downloaded"
            : rec.major_online > 0
              ? "available_to_download"
              : "in_catalogue_only";
        return {
            book_id: rec.book_id,
            book_name: rec.book_name,
            author_name: author?.author_name ?? null,
            death_year: author?.death_year ?? null,
            category: catalog.categoryPath(rec.book_category)[0] ?? null,
            book_date: rec.book_date,
            status,
            link: BOOK_PAGE(rec.book_id),
        };
    };

    for (const id of args.book_ids ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const c = describe(id);
        if (c) matched.push(c);
        // The id the caller passed in, echoed back so they can see which one
        // missed. Echoed as they wrote it: «٩٩٩٩٩٩» is not what they sent.
        else notes.push(L.noteUnknownId(String(id)));
    }

    if (args.query) {
        const words = queryWords(args.query);
        for (const rec of catalog.allBooks()) {
            if (seen.has(rec.book_id)) continue;
            if (args.category_id !== undefined && rec.book_category !== args.category_id) continue;
            const author = catalog.bookAuthors(rec)[0] ?? null;
            if (!matches(rec.book_name, words) && !(author && matches(author.author_name, words))) continue;
            seen.add(rec.book_id);
            const c = describe(rec.book_id);
            if (c) matched.push(c);
        }
    }

    // Actionable first: a book that can be downloaded is the whole point.
    const rank: Record<DownloadStatus, number> = {
        available_to_download: 0,
        downloaded: 1,
        in_catalogue_only: 2,
    };
    matched.sort((a, b) => rank[a.status] - rank[b.status] || a.book_id - b.book_id);

    const total = matched.length;
    const results = matched.slice(0, args.limit);
    const availableCount = matched.filter((c) => c.status === "available_to_download").length;
    const downloadedCount = matched.filter((c) => c.status === "downloaded").length;
    const unavailableCount = matched.filter((c) => c.status === "in_catalogue_only").length;

    const next_steps: string[] = [];
    if (availableCount) {
        next_steps.push(L.stepDownloadInApp);
        next_steps.push(L.stepReadOnline);
        next_steps.push(L.stepPickedUpAutomatically);
    }
    if (unavailableCount) {
        next_steps.push(L.stepLookElsewhere);
    }
    if (!total) {
        notes.push(L.noteNoMatch);
    }
    if (downloadedCount && downloadedCount === total) {
        notes.push(L.noteAllDownloaded);
    }
    notes.push(L.noteOffline);

    const out: SuggestDownloadOutput = {
        query: args.query ?? null,
        total,
        returned: results.length,
        downloaded_count: downloadedCount,
        available_count: availableCount,
        unavailable_count: unavailableCount,
        results,
        next_steps,
        notes,
    };

    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, data.query ? L.headingQuery(data.query) : L.headingAll)];
        lines.push(
            L.summary(
                num(data.total),
                num(data.downloaded_count),
                num(data.available_count),
                num(data.unavailable_count),
            ),
        );
        for (const c of data.results) {
            const label =
                c.status === "downloaded"
                    ? L.statusDownloaded
                    : c.status === "available_to_download"
                      ? L.statusAvailable
                      : L.statusUnavailable;
            lines.push("", header(2, c.book_name));
            const meta = [c.author_name, c.death_year ? L.died(num(c.death_year)) : null, c.category]
                .filter(Boolean)
                .join(" — ");
            if (meta) lines.push(`*${meta}*`);
            lines.push(`- **${L.status}**: ${label}`);
            lines.push(`- **${L.shamelaId}**: ${String(c.book_id)}`);
            lines.push(`- **${L.bookPage}**: ${c.link}`);
        }
        if (data.next_steps.length) {
            lines.push("", header(3, L.stepsHeading));
            for (const s of data.next_steps) lines.push(`- ${s}`);
        }
        if (data.notes.length) {
            lines.push("", `**${L.notesHeading}**:`);
            for (const n of data.notes) lines.push(`- ${n}`);
        }
        return lines.join("\n");
    });
}
