import type { Slice } from "../labels.js";

/** Wording for shamela_get_toc. Arabic first; English translates it. */
export const getTocLabels: Slice<{
    /** Heading: the book this table of contents belongs to. */
    heading: (bookName: string) => string;
    /** Opens the ancestor-chain mode: the root chapter down to the current one. */
    chainHeading: string;
    /** One link in that chain. */
    chainLine: (title: string, titleId: string, pageId: string) => string;
    /** Stands in for a chapter the book gives no heading text for. */
    untitled: string;
    /**
     * One chapter of the subtree; the renderer supplies the indent.
     *
     * The id is named `page_id=` and not `page=`: no tool takes a `page`, and a
     * reader handed a key that does not exist has to guess which one was meant.
     * The chain line above has always spelled it correctly.
     */
    nodeLine: (title: string, titleId: string, pageId: string) => string;
}> = {
    ar: {
        heading: (bookName) => `فهرس «${bookName}»`,
        chainHeading: "**سلسلة الأبواب** (الجذر → الحالي):",
        chainLine: (title, titleId, pageId) => `- ${title} (title_id=${titleId}, page_id=${pageId})`,
        untitled: "(بدون عنوان)",
        nodeLine: (title, titleId, pageId) => `- **${title}** (title_id=${titleId}, page_id=${pageId})`,
    },
    en: {
        heading: (bookName) => `Table of contents: "${bookName}"`,
        chainHeading: "**Chapter chain** (root → current):",
        chainLine: (title, titleId, pageId) => `- ${title} (title_id=${titleId}, page_id=${pageId})`,
        untitled: "(untitled)",
        nodeLine: (title, titleId, pageId) => `- **${title}** (title_id=${titleId}, page_id=${pageId})`,
    },
};
