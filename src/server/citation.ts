/**
 * Citation formatters in three styles. Per `docs/citation-format.md`.
 *
 *   shamela — replica of Shamela's copy-with-citation:
 *             «<book>» (<part>/ <page>):
 *             «<text>»
 *   short   — <author>، <book>، (ج <part>،) ص <page>.
 *   full    — long form with the author's death year, with notes
 *             listing missing citation-grade metadata that master.db doesn't have.
 */

import type { AuthorRecord, BookRecord } from "./catalog.js";
import { arabize } from "./format.js";
import { SHAMELA_WEB } from "./constants.js";

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
    /**
     * A canonical, human-verifiable address for the passage on shamela.ws.
     *
     * Page-level when the page is established, book-level when it is not — and
     * `source_url_is_book_level` says which, so a book-level link is never read
     * as pointing at the page that was quoted. This is a STRING the extension
     * writes; nothing here fetches it, and the reader's browser is what would.
     * The ids are Shamela's own, already in the local catalogue.
     */
    source_url: string;
    source_url_is_book_level: boolean;
}

/**
 * What is missing from a full citation, as typed keys.
 *
 * These used to be English sentences built here, so get_citation's notes came
 * back half Arabic (the tool layer's) and half English (these) under the
 * default Arabic interface — and the tool de-duplicated them by regex-matching
 * /editor|muḥaqqiq/i against the TEXT, which any translation would silently
 * break. A key is language-free; the sentence for it lives in the i18n slice
 * with the rest of the tool's prose.
 */
export type CitationNoteKey =
    | "no_author_name"
    | "no_death_year"
    | "no_composition_year"
    | "no_edition_number"
    | "no_publisher"
    | "no_city"
    | "no_editor";

export interface FullCitationResult {
    formatted: string;
    components: CitationComponents;
    notes: CitationNoteKey[];
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
        // The address uses page_id — Shamela's own key, the one its site routes
        // on — not the printed page, which is a different number under the same
        // word and would open the wrong place.
        source_url:
            page?.page_id !== undefined && page.page_id !== null
                ? `${SHAMELA_WEB}/book/${book.book_id}/${page.page_id}`
                : `${SHAMELA_WEB}/book/${book.book_id}`,
        source_url_is_book_level: page?.page_id === undefined || page.page_id === null,
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
    // `book_date` deliberately does NOT appear here. It is not the year the
    // book was written: on this catalogue it equals the main author's death
    // year for 8,467 of 8,593 books, and for the remaining 126 — abridgements
    // and commentaries — it is the ORIGINAL author's death year. Printed bare
    // after the author it produced citations that contradicted themselves on
    // one line: «ناصر الدين الألباني (ت ١٤٢٠هـ). صحيح الترغيب والترهيب.
    // ٦٥٦هـ.» — a man dead in 1420 credited with writing in 656. It stays in
    // `components.book_date` for callers who know what it is.
    if (c.part) tail.push(`ج ${arabize(c.part)}`);
    if (c.printed_page) tail.push(`ص ${arabize(c.printed_page)}`);
    if (c.auto_numbered) tail.push("بترقيم الشاملة آليا");

    const formatted =
        head.join(". ") + (tail.length ? ". " + tail.join("، ") + "." : ".");

    const notes: CitationNoteKey[] = [];
    if (!c.author_name) notes.push("no_author_name");
    if (!c.death_year && c.author_name) notes.push("no_death_year");
    // Unconditional: master.db has no composition year for ANY book —
    // book_date is Shamela's dating stamp, not the year the work was written.
    notes.push("no_composition_year");
    notes.push("no_edition_number");
    notes.push("no_publisher");
    notes.push("no_city");
    notes.push("no_editor");

    return { formatted, components: c, notes };
}
