/**
 * Citation formatters in three styles. Per `docs/citation-format.md`.
 *
 *   shamela — replica of Shamela's copy-with-citation:
 *             «<book>» (<part>/ <page>):
 *             «<text>»
 *   short   — <author>، <book>، (ج <part>،) ص <page>.
 *   full    — long form with death year + book composition year, with notes
 *             listing missing citation-grade metadata that master.db doesn't have.
 */

import type { AuthorRecord, BookRecord } from "./catalog.js";
import { arabize } from "./format.js";

const BOOK_PLACEHOLDER = "الكتاب"; // treated same as null part

export interface PageRef {
    page_id: number;
    part?: string | null;
    page?: number | null;
}

export interface CitationComponents {
    book_id: number;
    book_name: string;
    author_id: number | null;
    author_name: string | null;
    death_year: number | null;
    book_date: number | null;
    part: string | null;
    printed_page: string | null;
    auto_numbered: boolean; // true when book.printed != 1
}

export interface FullCitationResult {
    formatted: string;
    components: CitationComponents;
    notes: string[];
}

/** Build the citation components shared by all three styles. */
export function buildComponents(
    book: BookRecord,
    author: AuthorRecord | null,
    page?: PageRef,
): CitationComponents {
    let partRaw = page?.part ?? null;
    if (partRaw && partRaw.trim() === BOOK_PLACEHOLDER) partRaw = null;
    return {
        book_id: book.book_id,
        book_name: book.meta_data?.prefix?.replace(/[«»]/g, "") || book.book_name,
        author_id: author?.author_id ?? book.main_author ?? null,
        author_name: author?.author_name ?? null,
        death_year: author?.death_year ?? null,
        book_date: book.book_date,
        part: partRaw && partRaw.trim() ? partRaw.trim() : null,
        printed_page: page?.page !== null && page?.page !== undefined ? String(page.page) : null,
        auto_numbered: book.printed !== 1,
    };
}

/**
 * Default style — replicates Shamela's UI. Returns the prefix line only when
 * `text` is omitted; with `text`, returns the two-line block.
 */
export function formatShamelaCitation(
    book: BookRecord,
    author: AuthorRecord | null,
    page?: PageRef,
    text?: string,
): string {
    const c = buildComponents(book, author, page);
    let pageStr: string;
    if (c.part) {
        const partA = arabize(c.part);
        const pageA = c.printed_page ? arabize(c.printed_page) : "";
        pageStr = pageA ? `${partA}/ ${pageA}` : partA;
    } else if (c.printed_page) {
        pageStr = `ص ${arabize(c.printed_page)}`;
    } else {
        pageStr = "";
    }
    const suffix = book.meta_data?.suffix?.trim();
    if (suffix) pageStr = pageStr ? `${pageStr} ${suffix}` : suffix;
    if (c.auto_numbered) {
        pageStr = pageStr ? `${pageStr} بترقيم الشاملة آليا` : "بترقيم الشاملة آليا";
    }
    const prefix = pageStr ? `«${c.book_name}» (${pageStr})` : `«${c.book_name}»`;
    if (text) return `${prefix}:\n«${text}»`;
    return prefix;
}

/** Compact reference for inline footnotes. */
export function formatShortCitation(
    book: BookRecord,
    author: AuthorRecord | null,
    page?: PageRef,
): string {
    const c = buildComponents(book, author, page);
    const parts: string[] = [];
    if (c.author_name) parts.push(c.author_name);
    parts.push(c.book_name);
    if (c.part) parts.push(`ج ${arabize(c.part)}`);
    if (c.printed_page) parts.push(`ص ${arabize(c.printed_page)}`);
    return parts.join("، ") + ".";
}

/**
 * Long-form citation. Lists missing components in `notes` so the LLM knows
 * what's available vs. what to flag (or fill in from external knowledge).
 */
export function formatFullCitation(
    book: BookRecord,
    author: AuthorRecord | null,
    page?: PageRef,
): FullCitationResult {
    const c = buildComponents(book, author, page);
    const head: string[] = [];
    if (c.author_name) {
        head.push(
            c.death_year ? `${c.author_name} (ت ${arabize(c.death_year)}هـ)` : c.author_name,
        );
    }
    head.push(c.book_name);

    const tail: string[] = [];
    if (c.book_date) tail.push(`${arabize(c.book_date)}هـ`);
    if (c.part) tail.push(`ج ${arabize(c.part)}`);
    if (c.printed_page) tail.push(`ص ${arabize(c.printed_page)}`);
    if (c.auto_numbered) tail.push("بترقيم الشاملة آليا");

    const formatted =
        head.join(". ") + (tail.length ? ". " + tail.join("، ") + "." : ".");

    const notes: string[] = [];
    if (!c.author_name) notes.push("author name not available in master.db for this book");
    if (!c.death_year && c.author_name) notes.push("author death year not available");
    if (!c.book_date) notes.push("book composition year (book_date) not available");
    notes.push("edition number not available in master.db");
    notes.push("publisher not available in master.db");
    notes.push("city of publication not available in master.db");
    notes.push("editor / muḥaqqiq not available in master.db");

    return { formatted, components: c, notes };
}
