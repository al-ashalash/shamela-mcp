/**
 * Error taxonomy per `docs/architecture.md`. The user-visible wording comes
 * from the language catalogue (src/server/i18n/); the diagnostic parts — paths,
 * technical detail, stack contexts — read the same in every language.
 */

import { messages } from "./i18n/index.js";
import { ayatInSurah, surahName } from "./quran.js";

import { ShamelaNotFoundError } from "./paths.js";
import { HelperError } from "./helper.js";

export type ErrorCode =
    | "SHAMELA_NOT_INSTALLED"
    | "SHAMELA_NOT_FOUND"
    | "BOOK_NOT_FOUND"
    | "BOOK_NOT_DOWNLOADED"
    | "BOOK_INDEX_PENDING"
    | "ENGINE_TOO_OLD"
    | "INDEX_NOT_READY"
    | "BOOK_NOT_AVAILABLE"
    | "AUTHOR_NOT_FOUND"
    | "CATEGORY_NOT_FOUND"
    | "PAGE_NOT_FOUND"
    | "TITLE_NOT_FOUND"
    | "AYA_NOT_FOUND"
    | "SERVICE_KEY_NOT_FOUND"
    | "EMPTY_SCOPE"
    | "OPTION_NOT_SUPPORTED"
    | "OPTION_CONFLICT"
    | "BAD_ARG"
    | "HELPER_DIED"
    | "HELPER_TIMEOUT"
    | "INTERNAL";

export class ShamelaError extends Error {
    code: ErrorCode;
    data?: unknown;

    constructor(code: ErrorCode, message: string, data?: unknown) {
        super(message);
        this.code = code;
        this.data = data;
        this.name = "ShamelaError";
    }
}

export function bookNotFound(bookId: number): ShamelaError {
    return new ShamelaError("BOOK_NOT_FOUND", messages().errors.bookNotFound(bookId));
}

export function bookNotDownloaded(bookId: number, bookName?: string): ShamelaError {
    const L = messages().errors;
    const name = bookName ? L.bookRefNamed(bookName, bookId) : L.bookRefBare(bookId);
    return new ShamelaError("BOOK_NOT_DOWNLOADED", L.bookNotDownloaded(name));
}

/**
 * The book is on disk, but the search engine has not read its index yet.
 *
 * The helper opens Shamela's Lucene indexes when it starts, so a book that was
 * downloaded during this conversation is in the catalog and on disk while its
 * text is not yet reachable. Saying so plainly is the whole point: the previous
 * behaviour returned an empty page body, which reads as "this book is empty".
 */
export function bookIndexPending(bookId: number, bookName?: string): ShamelaError {
    const L = messages().errors;
    const name = bookName ? L.bookRefNamed(bookName, bookId) : L.bookRefBare(bookId);
    return new ShamelaError("BOOK_INDEX_PENDING", L.bookIndexPending(name));
}

export function authorNotFound(authorId: number): ShamelaError {
    return new ShamelaError("AUTHOR_NOT_FOUND", messages().errors.authorNotFound(authorId));
}

export function categoryNotFound(categoryId: number): ShamelaError {
    return new ShamelaError("CATEGORY_NOT_FOUND", messages().errors.categoryNotFound(categoryId));
}

export function pageNotFound(bookId: number, pageId: number): ShamelaError {
    return new ShamelaError("PAGE_NOT_FOUND", messages().errors.pageNotFound(bookId, pageId));
}

export function titleNotFound(bookId: number, titleId: number): ShamelaError {
    return new ShamelaError("TITLE_NOT_FOUND", messages().errors.titleNotFound(bookId, titleId));
}

export function ayaNotFound(detail: string): ShamelaError {
    return new ShamelaError("AYA_NOT_FOUND", `Aya ${detail} does not exist (range is 1..6236).`);
}

/**
 * The surah+aya form of the same error.
 *
 * It used to fall through to ayaNotFound and quote «range is 1..6236» — the
 * range of the cumulative aya_id, an argument the caller never passed. Asking
 * for 108:5 got an invitation to retry with any verse number up to 6236, none
 * of which can ever be valid for سورة الكوثر. The retry advice has to bound
 * the argument that actually failed.
 */
export function ayaOutOfSurah(surah: number, aya: number): ShamelaError {
    const count = ayatInSurah(surah);
    const name = surahName(surah);
    const detail =
        count === null
            ? `surah=${surah} does not exist (surahs are 1..114)`
            : `surah=${surah} aya=${aya} does not exist — surah ${surah}${name ? ` (${name})` : ""} has ${count} ayat (1..${count})`;
    return new ShamelaError("AYA_NOT_FOUND", `Aya ${detail}.`);
}

export function emptyScope(diagnostics: Array<{ source: string; contributed: number }>): ShamelaError {
    const lines = diagnostics.map((d) => `  ${d.source}: ${d.contributed}`).join("\n");
    return new ShamelaError("EMPTY_SCOPE", messages().errors.emptyScope(lines), { diagnostics });
}

export function optionNotSupported(name: string): ShamelaError {
    return new ShamelaError(
        "OPTION_NOT_SUPPORTED",
        `Option '${name}' is not currently supported. The default analyzer already strips diacritics and folds alef/ya/waw/ta-marbuta. See docs/roadmap.md for the planned two-pass verification path.`,
    );
}

export function optionConflict(message: string): ShamelaError {
    return new ShamelaError("OPTION_CONFLICT", message);
}

export function badArg(message: string): ShamelaError {
    return new ShamelaError("BAD_ARG", message);
}

export function serviceKeyNotFound(service: string, key: number): ShamelaError {
    return new ShamelaError("SERVICE_KEY_NOT_FOUND", messages().errors.serviceKeyNotFound(service, key));
}

/**
 * The service table has no rows at all — a different fact from "this key is
 * not in it". On an install with no musnad collections downloaded, every key
 * produced the same key-blaming message, which reads as "try another key"
 * when no key can ever resolve.
 */
export function serviceEmpty(service: string): ShamelaError {
    return new ShamelaError("SERVICE_KEY_NOT_FOUND", messages().errors.serviceEmpty(service));
}

/** Format any error for an MCP tool error response. */
export function formatErrorMessage(err: unknown): string {
    if (err instanceof ShamelaError) return err.message;
    if (err instanceof ShamelaNotFoundError) return err.message;
    if (err instanceof HelperError) return `${err.code}: ${err.message}`;
    if (err instanceof Error) return err.message;
    return String(err);
}

/** Get the error code for any error (used by tool result envelopes). */
export function errorCode(err: unknown): ErrorCode {
    if (err instanceof ShamelaError) return err.code;
    if (err instanceof ShamelaNotFoundError) return "SHAMELA_NOT_FOUND";
    if (err instanceof HelperError) {
        const map: Record<string, ErrorCode> = {
            HELPER_DEAD: "HELPER_DIED",
            HELPER_DIED: "HELPER_DIED",
            HELPER_TIMEOUT: "HELPER_TIMEOUT",
            HELPER_ERROR: "INTERNAL",
            HELPER_WRITE_ERROR: "INTERNAL",
        };
        return map[err.code] ?? "INTERNAL";
    }
    return "INTERNAL";
}

/**
 * The installed Shamela is older than the search engine this extension needs.
 *
 * The helper is compiled against the Java that current Shamela builds ship, so
 * on an older install the JVM refuses to load it and the process exits with a
 * bare code 1 — which used to surface as "the helper died", sending users to
 * look for a fault in the extension. The cause is the Shamela app's version and
 * the fix is to update it, so say that.
 */
export function engineTooOld(installRoot: string): ShamelaError {
    return new ShamelaError("ENGINE_TOO_OLD", messages().errors.engineTooOld(installRoot));
}

/**
 * The helper started but could not open Shamela's search indexes.
 *
 * Java reports this on its startup line and then exits; that line used to be
 * dropped because it carries no request id, leaving only a generic "helper
 * died".
 */
export function indexNotReady(detail: string): ShamelaError {
    return new ShamelaError("INDEX_NOT_READY", messages().errors.indexNotReady(detail));
}
