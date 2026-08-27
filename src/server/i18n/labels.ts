/**
 * The wording a tool uses when it renders itself for a reader.
 *
 * These are kept next to nothing else. The catalogue in `ar.ts` holds what the
 * whole server says — its instructions, its tool titles, its errors — and it is
 * read in one place. A tool's own labels are read in one place too: that tool.
 * Putting all thirty-two tools' labels in one file would make every translation
 * a merge conflict and every review a scroll.
 *
 * So each tool keeps its slice beside it in `i18n/tools/`, in both languages at
 * once, which also means a reviewer sees the Arabic and the English of the same
 * sentence on adjacent lines — the only arrangement in which a mistranslation is
 * actually noticeable.
 *
 * Only the rendered markdown goes through here. The structured content a tool
 * returns is field names and values, and those are the same in every language;
 * translating them would break every caller reading them.
 */

import { arabize } from "../format.js";
import { currentLang } from "./index.js";

/** One tool's labels, in every language the extension carries. */
export type Slice<T> = { ar: T; en: T };

/**
 * The labels for the language in force.
 *
 * Called inside a renderer rather than at module load: a module can be imported
 * before the environment is read, and a slice captured then would pin the whole
 * process to whatever the language was at import time.
 */
export function pick<T>(slice: Slice<T>): T {
    return slice[currentLang()] ?? slice.ar;
}

/**
 * A number written the way the reader of this language writes numbers.
 *
 * Arabic prose in this extension uses Arabic-Indic digits (٦٢٣٦), which is
 * right for Arabic and wrong everywhere else — an English sentence with ٦٢٣٦ in
 * it is a translation that stopped halfway. Renderers call this instead of
 * `arabize` so the digits follow the sentence they sit in.
 *
 * Page ids, book ids and anything the user might type back are NOT passed
 * through here in either language: a user copying «٩٩٤٢» into a request has to
 * get 9942 back out.
 */
export function num(n: number | string | null | undefined): string {
    if (n === null || n === undefined || n === "") return "";
    return currentLang() === "ar" ? arabize(n) : String(n);
}
