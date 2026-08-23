/**
 * English — a translation of `ar.ts`, never a parallel original.
 *
 * The mission this serves is a narrow one: students who read classical Arabic
 * but do not read modern Arabic prose comfortably, and who would otherwise meet
 * the extension through an interface they cannot navigate. So the terms of the
 * discipline keep their Arabic alongside the English — a reader who knows what
 * a *matn* is should not have to guess that "main text" means it.
 *
 * The catalogue's shape comes from Arabic, so a key added there and forgotten
 * here is a compile error, not a blank string in someone's session.
 */

import type { Messages } from "./ar.js";
import { guideEn } from "./guide.en.js";

export const en: Messages = {
    instructions: `You are connected to the user's local Maktabah al-Shamela library, read-only. Observe the following:
- Never attribute a text to a book unless it actually came back from a tool result; never complete texts or chains of transmission from your own knowledge.
- Always distinguish the main text (matn / body) from the footnote (hashiya / foot); a footnote is the editor's or commentator's words, not the author's, so do not attribute it to him.
- When citing, use shamela_get_citation, and state when the page numbering is Shamela's own automatic count rather than the printed edition's.
- Never invent publication data (publisher, edition, editor) that is not there; if it is missing, say so.
- Search covers only the books downloaded on the user's machine; no results may mean the book is not downloaded rather than that nothing matches.
- For an exact consecutive phrase, or two words near each other, use shamela_search_phrase rather than shamela_search_pages.
- Do not flood the user with long text: get_page splits the body (body_part / body_total_parts / body_has_more), and get_pages_range and get_book_section stop at a size budget and return next_start_page_id; when a text runs long, present it in parts or ask the user how they want it (see the _display field).
- The library is heavily categorised (41 categories; tafsir alone is spread across categories 3, 4 and 5), so narrow searching and browsing with the right category_id.
- For tafsir: get_tafseer_of_aya uses Shamela's curated index alone, which covers few books; start with shamela_list_tafsirs_for_aya, which adds an index built from the books' own chapter headings and so reaches most of the user's downloaded tafsirs, then shamela_get_tafseer_texts to fetch the texts in one call, attributed.
- Never rule a hadith sound or weak on your own authority; report only a ruling that came back in a tool result (such as an editor's takhrij in a footnote), attributed to whoever made it.
- Before searching a question: make sure of how it is phrased and what it is called by the specialists, separate what is known from what is asked, and ask the user for clarification when the question is ambiguous.
- When comparing the schools of law: search each school's category separately, never one category for all, so that nothing is attributed to a school whose own books were not searched.
- Neutrality on preference: present the schools' positions attributed, with their evidence, and do not adjudicate between them unless the user asks.
- Trace to the original source: when a text you found is quoted at second hand — a passage in an editor's footnote, an attribution inside a commentary — say so, and point the researcher at the original: check its status with shamela_suggest_download (downloaded, so read it directly; offered, so it can be fetched and the search continued there; or not in Shamela, so it must be sought in sources outside it), and prefer reading the original over relying on the quotation wherever possible.
- Distinguish three things in what you present: text quoted verbatim (in quotation marks), your own summary of the author's words, and your own inference — and label the third as yours.
- In classical books whose chapters are untitled (their tables of contents repeat "fasl" with no headings), do not rely on get_toc alone to navigate; combine it with page reads.
- shamela_guide shows the extension's user guide when the user asks what it can do or how to use it (even loosely, as in "what can you do?").`,

    schemaDoc: `# Shamela data model (a summary for developers)
- **master.db**: the index of books, authors and categories. Table \`book\`: book_id, book_name, book_category, book_date, authors, major_ondisk (the book is downloaded).
- **book/<id%1000>/<id>.db**: one database per book. Table \`page\` (id, part, page, number, services) and table \`title\` (the chapter index).
- **service/{tafseer,hadeeth,trajim}.db**: the linking tables — \`service(key_id, book_id, page_id)\` and \`inservice(book, user_excluded)\`. key_id is the aya_id for tafsir, and a hadith key for hadith.
- **Lucene indexes**: page texts (body/foot/comment), chapter titles, authors and verses — read by the Java helper.
- Read-only; Shamela's files are never written to.`,

    guide: guideEn,

    guideUnknownSection: (requested: string, available: string[]) =>
        `No guide section called "${requested}"; the sections are: ${available.join(", ")} — the full guide is shown instead.`,

    toolTitles: {
        shamela_search_pages: "Search inside books (matn + footnotes)",
        shamela_search_titles: "Search chapter headings",
        shamela_search_books: "Search the book catalogue",
        shamela_search_authors: "Search the author catalogue",
        shamela_get_page: "Read a page",
        shamela_get_toc: "Read a book's table of contents",
        shamela_get_book: "Book details",
        shamela_get_author: "Author details",
        shamela_list_categories: "List categories",
        shamela_resolve: "Pin down which book or author is meant",
        shamela_get_pages_range: "Read a range of pages",
        shamela_get_book_section: "Read a chapter",
        shamela_get_citation: "Build a citation",
        shamela_search_quran: "Search the Qur'an",
        shamela_get_aya: "Read a verse",
        shamela_get_tafseer_of_aya: "Tafsir of a verse",
        shamela_get_books_for_hadith: "Books containing a hadith",
        shamela_list_downloaded_books: "List downloaded books",
        shamela_get_book_parts: "A book's volumes",
        shamela_get_page_services: "What a page is linked to",
        shamela_search_phrase: "Exact-phrase and proximity search",
        shamela_search_hadith: "Find a hadith by its wording",
        shamela_health: "Check the Shamela server",
        shamela_search_exact: "Exact search (diacritics, hamza, digits)",
        shamela_search_boolean: "Boolean search (and / or / not)",
        shamela_root_stats: "How far a root reaches in the library",
        shamela_books_by_period: "Books by period (dating and death)",
        shamela_list_tafsirs_for_aya: "Tafsir coverage of a verse",
        shamela_get_tafseer_texts: "Read the tafsirs of a verse",
        shamela_guide: "How to use this extension",
        shamela_verify_quote: "Check a quotation against its page",
        shamela_scan_consensus: "Find where a question is settled or disputed",
        shamela_research_scope: "Coverage receipt across the four schools",
        shamela_suggest_download: "Find a book you do not have",
    },

    resources: {
        categories: {
            title: "Library categories",
            description: "Shamela's categories, with how many books each holds and how many are downloaded.",
        },
        downloaded: {
            title: "Downloaded books",
            description: "The books actually on this machine (the ones search can reach).",
        },
        guide: {
            title: "How to use this extension",
            description: "A user's guide: every tool with example requests in plain language, and research tips.",
        },
        schema: { title: "Shamela data model", description: "A short description of Shamela's data layout, for developers." },
        status: { title: "Shamela server status", description: "Self-check: version, counters, and whether the library reads." },
    },

    errors: {
        bookNotFound: (bookId: number) => `Book ${bookId} is not in the catalogue.`,
        bookNotDownloaded: (name: string) =>
            `Book ${name} is not downloaded on this machine. Download it from the Shamela application first.`,
        bookIndexPending: (name: string) =>
            `Book ${name} was downloaded during this session, and the search engine reads its indexes at startup. ` +
            `Restart the Claude application to reach its text; its catalogue data and index are available now.`,
        bookRefNamed: (bookName: string, bookId: number) => `"${bookName}" (${bookId})`,
        bookRefBare: (bookId: number) => `${bookId}`,
        authorNotFound: (authorId: number) => `Author ${authorId} is not in the catalogue.`,
        categoryNotFound: (categoryId: number) => `Category ${categoryId} does not exist.`,
        pageNotFound: (bookId: number, pageId: number) => `Page ${pageId} does not exist in book ${bookId}.`,
        titleNotFound: (bookId: number, titleId: number) => `Heading ${titleId} does not exist in book ${bookId}.`,
        emptyScope: (lines: string) => `The scope you gave covers no books. Diagnostics:\n${lines}`,
        engineTooOld: (installRoot: string) =>
            `The Maktabah al-Shamela installation at ${installRoot} is too old to run the search engine this extension needs. ` +
            `Update the Shamela application to its latest version, then restart the Claude application. ` +
            `(The extension uses the search engine that ships with the application itself; it does not carry its own.)`,
        indexNotReady: (detail: string) =>
            `Shamela's search indexes could not be opened. ` +
            `Check that the application is not in the middle of downloading a book or rebuilding an index, then try again. ` +
            `Technical detail: ${detail}`,
        serviceKeyNotFound: (service: string, key: number) =>
            `No books are indexed for key ${key} in the ${service} service.`,
        serviceEmpty: (service: string) =>
            `The ${service} service index is empty on this machine — no book is enrolled in it, so NO key can resolve, whichever you try. Download musnad hadith collections from the Shamela app to build it, or rely on the printed takhrij in the books' footnotes via shamela_search_hadith.`,
    },

    startup: {
        notFound: (probedLines: string) =>
            `No Maktabah al-Shamela 4 installation was found. These paths were checked:\n${probedLines}\n\n` +
            `If it is installed, set the "Shamela folder" field in the extension's settings ` +
            `(or the SHAMELA_INSTALL_ROOT environment variable) to the installation folder — ` +
            `the one containing the database and app subfolders.`,
        probe: {
            valid: "valid",
            empty: "empty path",
            notAbsolute: "could not be resolved to an absolute path",
            missing: "does not exist",
            unreadable: (detail: string) => `could not be inspected: ${detail}`,
            notADirectory: "not a directory",
            noDatabaseDir: "no database subfolder",
            noAppDir: "no app subfolder",
        },
        jreOverrideInvalid: (value: string) =>
            `SHAMELA_JRE is set to ${value}, which does not point at a usable Java executable.`,
        jreNotFound: (appDir: string, probed: string) =>
            `The Java that ships with the Shamela application could not be found in ${appDir}. Checked: ${probed}. ` +
            `If the application is installed, update it to the latest version and restart Claude, ` +
            `or set the SHAMELA_JRE environment variable to a Java executable (advanced).`,
        luceneDirNotFound: (probed: string) =>
            `The search engine folder that ships with the Shamela application could not be found. Checked: ${probed}. ` +
            `Make sure the application is fully installed and up to date, then restart Claude.`,
        luceneDirEmpty: (dir: string) =>
            `The search engine folder ${dir} contains no .jar files, so the installation is incomplete. ` +
            `Reinstall or update the Shamela application, then restart Claude.`,
        helperCrashedTwice:
            "The Java helper has crashed more than once and will not be restarted. Restart Claude to try again.",
        javaTooOld:
            "The Java that ships with the Shamela application is too old to run the search engine. " +
            "Update the Shamela application, then restart Claude.",
        helperExitedFinal: (reason: string) =>
            `The Java helper stopped (${reason}). It has crashed more than once and will not be restarted.`,
        helperExitedRetry: (reason: string) =>
            `The Java helper stopped (${reason}). It will be restarted on the next request.`,
        helperDead: "The Java helper is not running.",
        helperTimeout: (cmd: string, timeoutMs: number) =>
            `The helper did not answer the ${cmd} command within ${timeoutMs} ms.`,
    },
};
