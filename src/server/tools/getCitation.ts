import { z } from "zod";

import type { Catalog } from "../catalog.js";
import {
    type CitationNoteKey,
    type CitationComponents,
    formatFullCitation,
    formatShamelaCitation,
    formatShortCitation,
} from "../citation.js";
import { bookNotFound } from "../errors.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header } from "../format.js";
import { pick } from "../i18n/labels.js";
import { getCitationLabels } from "../i18n/tools/getCitation.js";

export const getCitationInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    page_id: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
            "Optional page_id. When omitted, the citation references the book without a specific page (e.g. for a book-level citation).",
        ),
    text: z
        .string()
        .optional()
        .describe(
            "Optional quoted text. When provided in 'shamela' style, the output includes a two-line block: «<book>» (<part>/ <page>):\n«<text>».",
        ),
    style: z
        .enum(["shamela", "short", "full"])
        .default("shamela")
        .describe(
            "Citation style. 'shamela' replicates Shamela's UI copy-with-citation format (default). 'short' is a one-line inline reference. 'full' is the long form including author death year and book year, with notes listing missing fields (publisher/edition/etc are not in master.db).",
        ),
    ...ResponseFormatInput,
};
export const getCitationInput = z.object(getCitationInputShape).strict();

export interface GetCitationOutput {
    formatted: string;
    style: "shamela" | "short" | "full";
    components: CitationComponents;
    notes: string[];
}

export async function runGetCitation(
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof getCitationInput>,
): Promise<RenderedResponse<GetCitationOutput>> {
    const book = catalog.bookRecord(args.book_id);
    if (!book) throw bookNotFound(args.book_id);
    const author = book.main_author !== null ? catalog.authorRecord(book.main_author) ?? null : null;
    const pageRow = args.page_id !== undefined
        ? await pages.getPageRow(book.book_id, args.page_id)
        : null;
    const pageRef = pageRow
        ? { page_id: pageRow.page_id, part: pageRow.part, page: pageRow.page }
        : args.page_id !== undefined
            ? { page_id: args.page_id, part: null, page: null }
            : undefined;
    // A page that was asked for and does not exist has to be said out loud.
    // Turning a missing row into a page-less citation returned a clean,
    // publishable-looking «الروض المربع...» for page_id 99999 — the requested
    // page silently gone, `notes` empty, and nothing to distinguish it from a
    // deliberate book-level citation.
    const missingPage = args.page_id !== undefined && !pageRow;
    // And a book whose file is not here cannot be quoted from at all: get_page
    // answers BOOK_NOT_DOWNLOADED for the same id this tool cited without a
    // murmur, so the two disagreed about whether the book could be used.
    const unreadable = !catalog.isDownloaded(book.book_id) && !catalog.confirmOnDisk(book.book_id);

    let formatted: string;
    let noteKeys: CitationNoteKey[] = [];
    let components: CitationComponents;
    if (args.style === "shamela") {
        formatted = formatShamelaCitation(book, author, pageRef, args.text);
        // Reuse buildComponents via formatFullCitation shape for components.
        const full = formatFullCitation(book, author, pageRef);
        components = full.components;
    } else if (args.style === "short") {
        formatted = formatShortCitation(book, author, pageRef);
        const full = formatFullCitation(book, author, pageRef);
        components = full.components;
    } else {
        const full = formatFullCitation(book, author, pageRef);
        formatted = full.formatted;
        components = full.components;
        noteKeys = full.notes;
    }
    // Keys → the reader's language. These sentences were hardcoded English in
    // citation.ts, so the full style's notes arrived half Arabic (this layer's)
    // and half English (that one's) under the default Arabic interface.
    let notes: string[] = [];

    // (#25): surface muḥaqqiq/edition from the Shamela name
    // suffix («ت <editor>» / «ط <publisher>»), which master.db columns lack.
    const parts = book.book_name.split(/\s+-\s+/);
    const suffix = (book.meta_data?.suffix?.trim() || (parts.length > 1 ? parts[parts.length - 1]!.trim() : "")) || "";
    // i18n:arabic-data — «ت » and «ط » are Shamela's own prefixes for the
    // editor and the edition inside a book title; they are read, not shown.
    const editorFromName = /^ت\s/.test(suffix) ? suffix.replace(/^ت\s+/, "").trim() : null;
    // Digits after «ط » are an edition number, not a publisher. Reported as a
    // name, get_citation stated «الناشر/الطبعة (من اسم الشاملة): 1» while
    // denying, two lines down, that it knew the edition number it had read.
    const publisherRaw = /^ط\s/.test(suffix) ? suffix.replace(/^ط\s+/, "").trim() : null;
    const publisherFromName = publisherRaw && !/^[\d٠-٩]+$/.test(publisherRaw) ? publisherRaw : null;
    {
        const L = pick(getCitationLabels);
        // The name suffix answered some of the missing fields, so their
        // "not available" keys drop out — by key, not by the regex-on-text
        // match that any translation would have silently broken.
        const answered = new Set<CitationNoteKey>();
        if (editorFromName) answered.add("no_editor");
        if (publisherFromName) answered.add("no_publisher");
        const found: string[] = [];
        if (editorFromName) found.push(L.editorFromBookName(editorFromName));
        if (publisherFromName) found.push(L.publisherFromBookName(publisherFromName));
        notes = found.concat(noteKeys.filter((k) => !answered.has(k)).map((k) => L.fullNotes[k]));
    }

    // First, both of them: a citation that cannot be trusted must say so
    // before it says anything else, not three bullets down.
    {
        const L = pick(getCitationLabels);
        const head: string[] = [];
        if (unreadable) head.push(L.noteBookUnreadable);
        if (missingPage) head.push(L.notePageNotFound(String(args.page_id)));
        if (head.length) notes = head.concat(notes);
    }

    const out: GetCitationOutput = {
        formatted,
        style: args.style,
        components,
        notes,
    };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(getCitationLabels);
        const lines = [header(1, L.heading)];
        lines.push("```");
        lines.push(data.formatted);
        lines.push("```");
        // A citation a reader cannot check is a citation taken on trust. The
        // address is composed locally from Shamela's own ids — nothing here
        // fetches it — and it says plainly when it points at the book rather
        // than the page, so a book-level link is never read as the passage's.
        lines.push(
            "",
            data.components.source_url_is_book_level
                ? L.sourceUrlBookLevel(data.components.source_url)
                : L.sourceUrl(data.components.source_url),
        );
        if (data.notes.length) {
            lines.push("", header(2, L.notesHeading));
            for (const n of data.notes) lines.push(`- ${n}`);
        }
        return lines.join("\n");
    });
}
