import type { Slice } from "../labels.js";

/**
 * The one sentence three tools owe the reader when an answer came from a Latin
 * spelling rather than from an index.
 *
 * It lives here rather than in each tool's slice because it must not drift:
 * search_books, search_authors and resolve all fall back to the same
 * comparison, and a reader who learns what the line means in one of them has
 * learned it in all three.
 */
export const transliterationLabels: Slice<{
    /** Marks a whole answer as reached by spelling, not by an index hit. */
    note: string;
}> = {
    ar: {
        note: "لم يجد الفهرس العربي شيئًا لهذا الرسم اللاتيني، فقوبلت حروفه بأسماء الفهرس نفسها. وهذه ترشيحاتٌ تُراجَع لا نتائجُ فهرسة؛ فتثبَّت من الاسم العربي قبل البناء عليه.",
    },
    en: {
        note: "The Arabic index had nothing for this Latin spelling, so its letters were matched against the catalogue's own names. These are candidates to confirm, not index hits — check the Arabic name before relying on one.",
    },
};
