import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { Helper } from "../helper.js";
import type { PageStore, TocEntry } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { getTocLabels } from "../i18n/tools/getToc.js";
import { requireDownloadedBook } from "../gate.js";

export const getTocInputShape = {
    book_id: z.number().int().positive().describe("The book id."),
    parent_id: z.number().int().min(0).default(0).describe("Title id whose children to expand. 0 (default) returns top-level chapters."),
    depth: z.number().int().min(1).max(5).default(1).describe("How many levels deep to recurse (1–5, default 1)."),
    containing_page_id: z.number().int().positive().optional().describe("Alternate mode: instead of returning a subtree, return the ancestor chain (root → leaf chapter) for this page."),
    ...ResponseFormatInput };
export const getTocInput = z.object(getTocInputShape).strict();

export interface TocNode {
    title_id: number;
    title_text: string;
    page_id: number;
    parent_id: number;
    has_children: boolean;
    children?: TocNode[];
}

export interface GetTocOutput {
    book_id: number;
    book_name: string;
    mode: "subtree" | "ancestor_chain";
    parent_id: number | null;
    depth: number | null;
    titles: TocNode[];
    ancestor_chain: TocNode[];
}

function flattenIds(entries: TocEntry[], out: number[]) {
    for (const e of entries) {
        out.push(e.title_id);
        if (e.children) flattenIds(e.children, out);
    }
}

function attachTitles(entries: TocEntry[], titleMap: Map<number, string>): TocNode[] {
    return entries.map((e) => ({
        title_id: e.title_id,
        title_text: titleMap.get(e.title_id) ?? "",
        page_id: e.page_id,
        parent_id: e.parent_id,
        has_children: e.has_children,
        ...(e.children ? { children: attachTitles(e.children, titleMap) } : {}) }));
}

export async function runGetToc(
    helper: Helper,
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof getTocInput>,
): Promise<RenderedResponse<GetTocOutput>> {
    const rec = requireDownloadedBook(catalog, args.book_id);

    let mode: "subtree" | "ancestor_chain";
    let entries: TocEntry[];
    if (args.containing_page_id !== undefined) {
        mode = "ancestor_chain";
        entries = await pages.getAncestorChain(args.book_id, args.containing_page_id);
    } else {
        mode = "subtree";
        entries = await pages.getToc(args.book_id, args.parent_id, args.depth);
    }

    const allIds: number[] = [];
    flattenIds(entries, allIds);
    let titleMap = new Map<number, string>();
    if (allIds.length) {
        const batch = await helper.request<{
            results: Array<{ title_id: number; title_text: string }>;
        }>("get_titles_batch", { book_id: args.book_id, title_ids: allIds });
        titleMap = new Map(batch.results.map((t) => [t.title_id, t.title_text]));
    }
    const titles = attachTitles(entries, titleMap);

    const out: GetTocOutput = {
        book_id: args.book_id,
        book_name: rec.book_name,
        mode,
        parent_id: mode === "subtree" ? args.parent_id : null,
        depth: mode === "subtree" ? args.depth : null,
        titles: mode === "subtree" ? titles : [],
        ancestor_chain: mode === "ancestor_chain" ? titles : [] };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(getTocLabels);
        const lines: string[] = [];
        lines.push(header(1, L.heading(data.book_name)));
        if (data.mode === "ancestor_chain") {
            lines.push(L.chainHeading);
            for (const t of data.ancestor_chain) {
                lines.push(L.chainLine(t.title_text, String(t.title_id), String(t.page_id)));
            }
        } else {
            const render = (nodes: TocNode[], indent: number) => {
                for (const n of nodes) {
                    // Both numbers on this line are ids the reader types back, so
                    // both are Latin. The page_id used to be arabized here, and
                    // that was recorded as a decision to leave the Arabic output
                    // alone — but the chain branch twelve lines up was already
                    // printing the same id as page_id=1204, so one tool gave two
                    // answers for one number, and «(title_id=11, page=١٢٠٤)» had
                    // one line disagreeing with itself.
                    lines.push(
                        `${"  ".repeat(indent)}${L.nodeLine(n.title_text || L.untitled, String(n.title_id), String(n.page_id))}`,
                    );
                    if (n.children) render(n.children, indent + 1);
                }
            };
            render(data.titles, 0);
        }
        return lines.join("\n");
    });
}
