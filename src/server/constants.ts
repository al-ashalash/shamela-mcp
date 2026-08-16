/**
 * Shared constants. Per `docs/architecture.md` and the mcp-builder Node guide.
 */

export const VERSION = "2.0.0";

/** Maximum response size in characters before truncation. mcp-builder default. */
export const CHARACTER_LIMIT = 25_000;

/** Default `limit` for paginated tools. */
export const DEFAULT_LIMIT = 20;

/** Maximum `limit` accepted by paginated tools. */
export const MAX_LIMIT = 100;

/** Cap for coverage aggregation on the Java side (per architecture). */
export const COVERAGE_CAP = 5_000;

/** Snippet window in characters around the first match. */
export const SNIPPET_WINDOW = 80;

/** get_page: split a single page body into parts once it exceeds this many chars
 *  (long-text pagination — see issue #16). */
export const PAGE_BODY_BUDGET = 4_000;

/** Multi-page reads (get_pages_range / get_book_section): stop adding pages once
 *  cumulative body+foot characters exceed this, so long sections don't dump. */
export const MULTIPAGE_CHAR_BUDGET = 12_000;

/** LRU cache size for per-book SQLite handles. */
/**
 * Book databases held open at once.
 *
 * Each entry is the whole file as a byte image in wasm memory, so this is a
 * memory budget, not a handle count: a comparison across the four schools can
 * touch dozens of books in one answer, and evicting them at 50 meant re-reading
 * files that were about to be used again. Raised with that shape in mind rather
 * than as far as it would go — the books involved run to tens of megabytes.
 */
export const PER_BOOK_CACHE_LIMIT = 120;

/** Total verses in the Qur'an. Used for AYA_NOT_FOUND validation. */
export const QURAN_AYA_COUNT = 6236;

/** master.db sentinel for books with no known dating year. Normalised to null in Catalog.loadBooks. */
export const UNDATED_BOOK_DATE = 99999;

/** Bucket label for undated books in century breakdowns. */
export const UNDATED_CENTURY_LABEL = "غير مؤرَّخ";

/** Bump to invalidate every cached verse index after the parser changes. */
export const AYA_INDEX_SCHEMA_VERSION = 1;
/**
 * Books indexed per tool call. Building is fast (half a second at worst), but a
 * library with a hundred tafsirs would otherwise pay for all of them at once on
 * a single request; the rest are reported as pending and built on the next call.
 */
export const AYA_INDEX_BUILD_BUDGET_PER_CALL = 8;
/** Title ids per helper request. */
export const TITLES_BATCH_CHUNK = 2_000;
/**
 * Below this share of titles carrying text, the book is assumed to be one the
 * search engine has not read yet rather than one without titles.
 */
export const AYA_INDEX_MIN_TITLE_TEXT_RATIO = 0.5;
/**
 * Below this many characters, what follows a verse's marker on its page is a
 * heading and the verses themselves, not commentary — so the tafsir runs on to
 * the next page and the fetch follows it there. Sized from the observed
 * failures: ابن كثير's سورة الكوثر heading block is ~200 characters, and
 * الطبري's «القول في تأويل قوله» line is shorter still.
 */
export const VERSE_TAIL_MIN_CHARS = 400;
