/**
 * The user guide in English — a translation of `guide.ar.ts`.
 *
 * Two things are deliberately not translated away. Tool names stay as they are,
 * because they are identifiers the user may want to type. And the technical
 * vocabulary of the discipline keeps its Arabic on first use — *matn*,
 * *hashiya*, *takhrij* — because the reader this exists for knows those words
 * and would be slowed down, not helped, by "main text" and "marginal note".
 *
 * The examples are the part that matters most: they are what a user actually
 * types. They are rewritten as natural English requests, not transliterated
 * Arabic ones.
 */

export const guideEn = {
    intro: `# Guide to the "Search and Study in Maktabah al-Shamela" extension

## Introduction

This extension connects the Claude application to your own copy of **Maktabah al-Shamela 4** installed on your machine, so you can search, read and cite your downloaded books from inside the conversation. It rests on three principles:

- **The source is local**: the extension reads Shamela's database on your machine directly, with no server of its own in between.
- **Read-only**: the extension never modifies the library's data.
- **Honest attribution**: no text is attributed to a book except from a tool result; the *matn* (main text) is distinguished from the *hashiya* (footnote); and missing data is declared as missing rather than invented.

You do not need to memorise tool names. Write your request in plain language, as you would to a fellow researcher, and Claude picks the right tool. The examples below are requests you can type as they stand.`,

    tools: `## The extension's tools

### 1. Searching inside books

- **\`shamela_search_pages\`** — search the text of your downloaded pages (*matn*, footnotes and commentary) with scope filtering, morphological expansion and wildcards.
  Example: "Search the books of fiqh for the word istisna'."
- **\`shamela_search_phrase\`** — search for an exact consecutive phrase, or for words near each other (two words within a set distance).
  Example: "Find the phrase 'actions are by intentions' with the words in that order."
- **\`shamela_search_exact\`** — an exactness-preserving search that honours diacritics, hamza forms (أ إ آ versus bare ا) and digit systems (٠-٩ versus 0-9).
  Example: "Find عِلْم with exactly those vowels, not عَلَم."
- **\`shamela_search_boolean\`** — boolean search combining AND, OR and NOT (exclusion); giving a scope is recommended.
  Example: "Find pages that mention waqf together with either a mosque or a graveyard, but not sale."
- **\`shamela_search_titles\`** — search the chapter and section headings inside books.
  Example: "Show me the chapters whose headings mention fasting."
- **\`shamela_search_books\`** — search the book catalogue by title, author or bibliographic text; it works even before you have downloaded anything.
  Example: "Does Shamela's catalogue have books on legal maxims?"
- **\`shamela_search_authors\`** — search the author catalogue by name or biography; when nothing comes back, try the kunya, the nisba or the byname (Ibn Qudama / al-Muwaffaq).
  Example: "Find Ibn Qudama's biography and when he died."

### 2. Qur'an and tafsir

- **\`shamela_search_quran\`** — search the verses of the Qur'an (6,236 verses), including prefixed forms (searching for صبر also finds بالصبر).
  Example: "Search the Qur'an for the word sabr."
- **\`shamela_get_aya\`** — fetch a specific verse in imla'i and 'uthmani scripts and the Mushaf spelling.
  Example: "Give me Ayat al-Kursi in the 'uthmani script."
- **\`shamela_get_tafseer_of_aya\`** — list the books that comment on a given verse, with the page number, from Shamela's curated index alone (which covers few books; for the full picture, see the next two).
  Example: "Which books have the tafsir of Ayat al-Kursi?"
- **\`shamela_list_tafsirs_for_aya\`** — show how your downloaded tafsirs cover a particular verse, with an explicit status for each book: where the verse was located — from Shamela's index or from the book's own chapter headings — where it was not, and what has not been indexed yet (ask again to finish it).
  Example: "Which of my downloaded tafsirs covers verse 255 of al-Baqara?"
- **\`shamela_get_tafseer_texts\`** — fetch the tafsir texts of one verse at once from every book the verse could be located in, each attributed to its book, author and page.
  Example: "Get me the commentary on 'You alone we worship' from three tafsirs."

### 3. Hadith

- **\`shamela_search_hadith\`** — find a hadith by its wording: where it occurs, its keys, and its *takhrij* across your downloaded books.
  Example: "Trace the hadith 'actions are but by intentions' for me."
- **\`shamela_get_books_for_hadith\`** — given a Shamela hadith number, list the books that narrate it, with page numbers.
  Example: "Which of my downloaded books narrate this same hadith?"
- **\`shamela_get_page_services\`** — what a page is linked to: the Qur'anic verses, hadiths and chains of transmission it contains.
  Example: "Which verses and hadiths are on this page?"

### 4. Reading and browsing

- **\`shamela_get_page\`** — fetch a full page (*matn*, footnote and commentary) with its place in the book's table of contents, splitting a long *matn* into parts.
  Example: "Read me page 17 of al-Usul min 'Ilm al-Usul."
- **\`shamela_get_pages_range\`** — read a consecutive range of pages (from one up to twenty) from a downloaded book.
  Example: "Read five pages in a row from the beginning of the book."
- **\`shamela_get_toc\`** — fetch a book's table of contents as a tree, or the chain of chapters containing a given page.
  Example: "Show me the table of contents of Zad al-Mustaqni'."
- **\`shamela_get_book_section\`** — read a whole chapter of a book using its heading in the table of contents.
  Example: "Read me the whole chapter on water from this book."
- **\`shamela_get_book_parts\`** — a book's volumes, with the page count of each.
  Example: "Is this book in one volume or several?"

### 5. Catalogues and metadata

- **\`shamela_list_categories\`** — every category in the library (41 of them), with how many books each holds and how many of those you have downloaded.
  Example: "Show me the library's categories and how many downloaded books I have in each."
- **\`shamela_list_downloaded_books\`** — the books actually on this machine, filterable by category and content status.
  Example: "Which books do I have downloaded in the creed category?"
- **\`shamela_get_book\`** — a book's details: author, category, type, content status, and Shamela's dating year (which tracks the original author's death, not when the book was written).
  Example: "Give me the details of Majmu' al-Fatawa: its author, its category, and whether I have it."
- **\`shamela_get_author\`** — an author's details and the list of their books, with the download status of each.
  Example: "Who was Ibn Qudama, and which of his books are in my library?"
- **\`shamela_resolve\`** — pin down which book or author is meant in Shamela's catalogues from an Arabic name, even a partial one.
  Example: "I mean al-Sharh al-Mumti' — which book is that exactly in the library?"
- **\`shamela_get_citation\`** — build a ready citation in three styles: Shamela's default, a short form, or an expanded one.
  Example: "Give me the formatted citation for this page in Shamela's style."

### 6. Statistics and chronology

- **\`shamela_root_stats\`** — measure how far an Arabic root reaches across your downloaded library through a morphological search, broken down by category, Hijri century, book and author.
  Example: "How widely does the root sabr spread across my library, by century?"
- **\`shamela_books_by_period\`** — filter the book catalogue by date, on Shamela's dating year or the principal author's death year. Note the catalogue's dating year is not a composition year — it tracks the original author's death.
  Example: "Show me books by authors who died in the eighth Hijri century."

### 7. Diagnostics and the guide

- **\`shamela_health\`** — a self-check: the server's version, how many books are in the catalogue and how many are downloaded, and a quick verification that the library reads. Use it first if the tools look broken or empty.
  Example: "Check the Shamela extension and make sure it is working."
- **\`shamela_guide\`** — show the extension's user guide (this guide) inside the conversation, whole or by section: the tools or the tips.
  Example: "What can the Shamela extension do?"
- **\`shamela_suggest_download\`** — look a book up in Shamela's full catalogue (downloaded or not) and say what can be done about it: already on your machine, offered for download with its id and its page link, or in the catalogue but not offered, so you must look elsewhere. Useful when a downloaded book cites one you cannot find.
  Example: "The book the editor cited is not in my library — is it available in Shamela?"
- **\`shamela_verify_quote\`** — check a quotation against the page it is credited to: present letter for letter, present with differences in diacritics/hamza/digits (the differences are named), or not found in what was examined. It says whether the wording sits in the author's matn or in the editor's footnote — attributing a footnote to the author is a misattribution however exactly it matches — and it catches the confusion between a page id and a printed page number, which is the commonest fault in a hand-carried citation.
  Example: "This passage is credited to al-Mughni, vol. 4 p. 120 — check it."
- **\`shamela_scan_consensus\`** — find where a question is declared settled and where it is declared open: it sweeps the subject against the fixed formulas of agreement and of disagreement, and returns for each its count, its witnesses, how it falls across the four schools, and its own total in the same scope — so you can tell a school's habit of phrasing from the question's own weight. It gives no verdict: the index cannot see negation or rebuttal, so "he claimed ijmaa, wrongly" carries the formula without asserting it. The witnesses are the evidence.
  Example: "Is wiping over the khuffayn disputed? Show me where the dispute is."
- **\`shamela_research_scope\`** — a coverage receipt: one row per school even where nothing was found, and each row says what its zero means — «silent» if that school's books are here and say nothing, «cannot tell» if none of its books is here at all. In an argument those are opposite conclusions; on a search screen they look identical, which is why this tool exists. It takes synonyms too, because a school that names the question differently is not a school that is silent about it.
  Example: "Before I write that the Malikis never discussed istisnaa — how many of their books do I even have?"`,

    tips: `## Tips for the researcher

**Narrow the scope by category.** The library has 41 categories, and works of tafsir alone are spread across three of them (tafsir; Qur'anic sciences and the principles of tafsir; and tajwid and the readings). Ask for the search to be confined to the right category — "search only the Hanbali fiqh books" — and the results get cleaner and faster.

**Pick the right kind of search.**
- A word and what derives from it: ask for a "morphological search", and searching for صبر finds صابر, يصبر and اصطبار.
- The start of a word, or a pattern: use the wildcards "*" and "?" (they cannot be combined with a morphological search).
- An exact consecutive phrase, or two words near each other: ask for a "phrase" or "proximity" search.
- Diacritics, hamza forms or digit systems: ask for an "exact search".
- Combining and excluding: ask for a boolean search — "containing this and that, but not the other".

**Know the extension's limits (this is its honesty).**
- Search covers only the books downloaded on your machine; the absence of a result does not mean the absence of the opinion from books you have not downloaded.
- The extension never rules a hadith sound or weak on its own authority; it reports what came back in a tool result (such as an editor's *takhrij* in a footnote), and a footnote is the editor's words, not the author's.
- A verse is located in a tafsir either from Shamela's curated index or from an index built from the book's own chapter headings, which together reach most of your downloaded tafsirs rather than a few of them; where it could not be located the coverage tool says so explicitly, and that is no proof the book lacks commentary on the verse. A place is never inferred by matching the wording of the verse, because wording repeated across surahs yields a confident attribution to the wrong page.
- Publication data (edition, publisher, editor) is often missing from Shamela's database, so citations declare what is missing rather than inventing it; and page numbering is declared as such when it is Shamela's own automatic count.

**Fill the gaps in your library before concluding there is nothing.** If you are searching a discipline whose standard works you have not downloaded — the principles of *takhrij*, research method, the principles of tafsir — then an empty result describes your library, not the question. Ask: "Which books are available in Shamela's catalogue in this field?" and they will be listed by name and number; then download what you need from inside the Shamela application and carry on searching in the same session.

For more: the extension's page on GitHub covers installation and the common problems.`,
};
