/**
 * shamela_research_scope — how much of each school you actually reached.
 *
 * The extension already tells researchers, in prose, to say which madhhab they
 * found nothing in. Prose instructions are forgotten, and the failure they
 * guard against is silent: a sweep that returns forty Hanbali pages and none
 * from the Malikis reads as «the Malikis are silent on this», when the honest
 * reading is often «you have four Maliki books and none of them is a fiqh
 * manual». Both produce the same zero, and they are opposite conclusions.
 *
 * So the instruction becomes data. One row per school, always all four, and
 * every row says which of four things its number means:
 *
 *   found         the term is there, in this many of the school's books
 *   silent        its books were SEARCHED and none of them says it — the only
 *                 zero that is evidence about the tradition
 *   not_searched  its books are on this machine and the caller's scope
 *                 excluded them, so the school was never asked
 *   cannot_tell   none of its books is downloaded, so the zero is about the
 *                 library on this disk and about nothing else
 *
 * A fifth row counts what falls outside the four schools entirely. Shamela
 * files each school's fiqh under its own category and leaves general fiqh,
 * usul and the fatwa collections outside all of them — deliberately, so a
 * comparison of schools never silently absorbs them (catalog.ts). That means
 * the four rows do not add up to the total, and a receipt that hid the
 * remainder would be inviting the reader to think they did.
 *
 * One search per term, and the whole receipt is built from the rollup that
 * search already returns — the same rollup shamela_root_stats reads. Nothing
 * is sampled unless the engine says so, and when it does the row says so.
 */

import { z } from "zod";

import { CatalogScope, MADHHAB_CATEGORY, type Catalog } from "../catalog.js";
import { badArg, emptyScope } from "../errors.js";
import type { Helper } from "../helper.js";
import { ResponseFormatInput, ScopeInputShape, type ScopeInputType } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { researchScopeLabels } from "../i18n/tools/researchScope.js";
import { droppedNote } from "../i18n/tools/droppedWords.js";

export type Madhhab = keyof typeof MADHHAB_CATEGORY;
const SCHOOLS = Object.keys(MADHHAB_CATEGORY) as Madhhab[];

/** Books named per school in the receipt — enough to act on, not a search result. */
const BOOKS_SHOWN = 3;

export const researchScopeInputShape = {
    term: z
        .string()
        .min(2)
        .describe("The term whose coverage is being measured — «الاستصناع», «خيار المجلس». One to five words; every word must occur on the page."),
    synonyms: z
        .array(z.string().min(2))
        .max(5)
        .optional()
        .describe(
            "Other wordings of the same question, each measured separately and reported as its own column. A school that uses a different term for a thing is not a school that is silent about it — this is what catches that.",
        ),
    scope: z
        .object(ScopeInputShape)
        .strict()
        .optional()
        .describe("Narrow the sweep further (period, author, downloaded_only). The four school rows are always reported, whatever the scope leaves in them."),
    ...ResponseFormatInput,
};
export const researchScopeInput = z.object(researchScopeInputShape).strict();

interface RawEnvelope {
    total_hits: number;
    normalized_tokens: string[];
    dropped_tokens?: string[];
    coverage: { by_book_key: Record<string, number>; total_seen: number; at_cap?: boolean; basis?: string };
}

export interface SchoolRow {
    madhhab: Madhhab;
    category_id: number;
    /** Books Shamela catalogues under this school, and how many are on this disk. */
    books_in_catalogue: number;
    books_downloaded: number;
    /**
     * Of those, how many the SCOPE let the sweep reach. The status is judged
     * against this, never against the machine-wide count: a school whose books
     * the scope excluded was not asked, and a school that was not asked cannot
     * be reported silent.
     */
    books_searched: number;
    /** Books of this school in which any of the terms was found. Union — exact. */
    books_with_hits: number;
    /** Pages per term. Never summed: one page may carry two of the terms. */
    pages_by_term: Record<string, number>;
    /**
     * What this row's zero means, when it is a zero. The distinction the whole
     * tool exists for: `silent` is evidence, `cannot_tell` is a gap in the
     * library wearing the same clothes.
     */
    status: "found" | "silent" | "not_searched" | "cannot_tell";
    /** A few of the books the term was actually found in, most pages first. */
    books: Array<{ book_id: number; book_name: string; pages: number }>;
}

export interface ResearchScopeOutput {
    term: string;
    terms: string[];
    /** Pages per term across everything searched, whatever category it is in. */
    total_by_term: Record<string, number>;
    schools: SchoolRow[];
    /**
     * What the four school rows do not include: general fiqh, usul, fatwa,
     * hadith and everything else. Reported so the rows are not read as a total.
     */
    outside_the_schools: { pages_by_term: Record<string, number>; books_with_hits: number };
    searched: { books: number; downloaded_total: number; scoped: boolean };
    /** True when the engine sampled rather than counted a term's distribution. */
    sampled_terms: string[];
    /**
     * Words the engine could not take, per term. A receipt built from a
     * narrowed question measures the wrong thing in every one of its rows.
     */
    dropped_tokens?: string[];
    /** The sentence a reader must not be allowed to skip. */
    reading_note: string;
    caveats: string[];
}

/**
 * Which of the four things a school's row means.
 *
 * Ordered by what the reader is entitled to conclude, and the order is the
 * whole safeguard:
 *
 *   found         pages were hit — nothing to qualify
 *   silent        books of this school were actually READ and none says it.
 *                 The only row a researcher may cite as evidence about the
 *                 school, so it demands the strongest precondition: `searched`
 *                 must count books on the disk, never books the catalogue
 *                 merely lists
 *   not_searched  its books are here and the scope left them out
 *   cannot_tell   none of its books is here at all
 *
 * A pure function because both wrong answers this tool has produced were
 * orderings of these four lines, and a truth table is the only way to see an
 * ordering whole.
 */
export function schoolStatus(
    hits: number,
    searched: number,
    downloaded: number,
): SchoolRow["status"] {
    if (hits > 0) return "found";
    if (searched > 0) return "silent";
    if (downloaded > 0) return "not_searched";
    return "cannot_tell";
}

export async function runResearchScope(
    helper: Helper,
    catalog: Catalog,
    args: z.infer<typeof researchScopeInput>,
): Promise<RenderedResponse<ResearchScopeOutput>> {
    const terms = [args.term, ...(args.synonyms ?? [])];
    const unique = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean)));
    if (!unique.length) throw badArg("Pass a term to measure.");

    let scopeBookKeys: string[] | null = null;
    let searchedBooks = catalog.downloadedBookIds().size;
    if (args.scope) {
        const scopeInput: ScopeInputType = {
            ...(args.scope as ScopeInputType),
            downloaded_only: args.scope?.downloaded_only ?? false,
        };
        const resolved = new CatalogScope(catalog).resolveBookIds(scopeInput);
        if (resolved.book_ids.length === 0) throw emptyScope(resolved.diagnostics);
        scopeBookKeys = resolved.book_ids.map(String);
        searchedBooks = resolved.book_ids.length;
    }

    const L = pick(researchScopeLabels);
    const schoolOfCategory = new Map<number, Madhhab>(
        SCHOOLS.map((name) => [MADHHAB_CATEGORY[name], name]),
    );

    const totalByTerm: Record<string, number> = {};
    const sampled: string[] = [];
    const dropped: string[] = [];
    let droppedFor: string | null = null;
    /** school → book_id → pages, accumulated across terms. */
    const perSchool = new Map<Madhhab, Map<number, number>>(SCHOOLS.map((s) => [s, new Map()]));
    const perSchoolByTerm = new Map<Madhhab, Record<string, number>>(SCHOOLS.map((s) => [s, {}]));
    const outsideByTerm: Record<string, number> = {};
    const outsideBooks = new Set<number>();

    for (const term of unique) {
        const raw = await helper.request<RawEnvelope>("search_pages", {
            query: term,
            scope_book_keys: scopeBookKeys,
            // The rollup is the whole answer; a page of results would be waste.
            max_results: 1,
            offset: 0,
            options: {},
        });
        totalByTerm[term] = raw.total_hits;
        for (const word of raw.dropped_tokens ?? []) if (!dropped.includes(word)) dropped.push(word);
        if (!droppedFor) droppedFor = droppedNote(raw);
        if (raw.coverage?.basis && raw.coverage.basis !== "all_results") sampled.push(term);
        for (const school of SCHOOLS) perSchoolByTerm.get(school)![term] = 0;
        outsideByTerm[term] = 0;

        for (const [key, pages] of Object.entries(raw.coverage?.by_book_key ?? {})) {
            const bookId = Number(key);
            const rec = catalog.bookRecord(bookId);
            const school = rec?.book_category != null ? schoolOfCategory.get(rec.book_category) : undefined;
            if (school) {
                perSchoolByTerm.get(school)![term] = (perSchoolByTerm.get(school)![term] ?? 0) + pages;
                const books = perSchool.get(school)!;
                books.set(bookId, (books.get(bookId) ?? 0) + pages);
            } else {
                outsideByTerm[term] = (outsideByTerm[term] ?? 0) + pages;
                outsideBooks.add(bookId);
            }
        }
    }

    // The ids the sweep could actually READ: the scope intersected with what is
    // on the disk, or — with no scope — everything on the disk.
    //
    // The intersection is the whole point. A scope resolves against the
    // CATALOGUE, and the catalogue ships complete before anything is
    // downloaded, so `scope: {category_ids:[14]}` names every Hanafi book
    // Shamela knows of, most of which may not be here. Counting those as
    // searched made a school with nothing on the disk report «silent — its
    // books were searched and say nothing», which is this tool's one forbidden
    // sentence: it is the inversion the tool exists to prevent, and an earlier
    // draft of this very fix reintroduced it pointing the other way. The index
    // holds no page of an undownloaded book, so nothing of it was ever read.
    const searchedIds = new Set(
        (scopeBookKeys !== null
            ? scopeBookKeys.map(Number).filter((id) => catalog.isDownloaded(id))
            : [...catalog.downloadedBookIds()]),
    );
    // And the header must not contradict the rows: what was searched is what
    // could be read, not what the scope named.
    if (scopeBookKeys !== null) searchedBooks = searchedIds.size;

    const schools: SchoolRow[] = SCHOOLS.map((madhhab) => {
        const categoryId = MADHHAB_CATEGORY[madhhab];
        const inCatalogue = catalog.booksInCategory(categoryId);
        const downloaded = inCatalogue.filter((id) => catalog.isDownloaded(id)).length;
        const searched = inCatalogue.filter((id) => searchedIds.has(id)).length;
        const found = perSchool.get(madhhab)!;
        const books = [...found.entries()]
            .sort((a, b) => b[1] - a[1] || a[0] - b[0])
            .slice(0, BOOKS_SHOWN)
            .map(([book_id, pages]) => ({
                book_id,
                book_name: catalog.bookRecord(book_id)?.book_name ?? `(unknown ${book_id})`,
                pages,
            }));
        return {
            madhhab,
            category_id: categoryId,
            books_in_catalogue: inCatalogue.length,
            books_downloaded: downloaded,
            books_searched: searched,
            books_with_hits: found.size,
            pages_by_term: perSchoolByTerm.get(madhhab)!,
            status: schoolStatus(found.size, searched, downloaded),
            books,
        };
    });

    const caveats: string[] = [];
    // First, because it changes what every row below is a measurement OF.
    if (droppedFor) caveats.push(droppedFor);
    if (schools.some((s) => s.status === "not_searched")) caveats.push(L.caveats.notSearched);
    if (schools.some((s) => s.status === "cannot_tell")) caveats.push(L.caveats.notDownloaded);
    if (schools.some((s) => s.status === "silent")) caveats.push(L.caveats.silentMeansSilent);
    if (unique.length === 1) caveats.push(L.caveats.oneWording);
    if (sampled.length) caveats.push(L.caveats.sampled(sampled));

    const out: ResearchScopeOutput = {
        term: args.term,
        terms: unique,
        total_by_term: totalByTerm,
        schools,
        outside_the_schools: { pages_by_term: outsideByTerm, books_with_hits: outsideBooks.size },
        searched: {
            books: searchedBooks,
            downloaded_total: catalog.downloadedBookIds().size,
            scoped: scopeBookKeys !== null,
        },
        sampled_terms: sampled,
        ...(dropped.length ? { dropped_tokens: dropped } : {}),
        reading_note: L.readingNote,
        caveats,
    };

    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, L.heading(data.terms.map((t) => `«${t}»`).join(" · ")))];
        lines.push(L.searchedLine(num(data.searched.books), num(data.searched.downloaded_total), data.searched.scoped));
        lines.push("", `> *${data.reading_note}*`, "");
        lines.push(L.tableHead(data.terms), L.tableRule(data.terms.length));
        for (const s of data.schools) {
            const cells = data.terms.map((t) => num(s.pages_by_term[t] ?? 0)).join(" | ");
            lines.push(
                `| ${L.madhhab[s.madhhab]} | ${cells} | ${num(s.books_with_hits)} | ${num(s.books_searched)} / ${num(s.books_downloaded)} / ${num(s.books_in_catalogue)} | ${L.status[s.status]} |`,
            );
        }
        const outsideCells = data.terms.map((t) => num(data.outside_the_schools.pages_by_term[t] ?? 0)).join(" | ");
        lines.push(
            `| ${L.outsideRow} | ${outsideCells} | ${num(data.outside_the_schools.books_with_hits)} | — | — |`,
        );
        lines.push("", `*${L.outsideNote}*`);

        const withBooks = data.schools.filter((s) => s.books.length);
        if (withBooks.length) {
            lines.push("", header(2, L.booksHeading));
            for (const s of withBooks) {
                lines.push(
                    `- **${L.madhhab[s.madhhab]}**: ${s.books.map((b) => `${b.book_name} (${num(b.pages)})`).join(L.listSeparator)}`,
                );
            }
        }
        if (data.caveats.length) {
            lines.push("", header(2, L.caveatsHeading));
            for (const c of data.caveats) lines.push(`- ${c}`);
        }
        return lines.join("\n");
    });
}
