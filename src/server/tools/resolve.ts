import { z } from "zod";

import type { Catalog } from "../catalog.js";
import type { Helper } from "../helper.js";
import { ResponseFormatInput } from "../schemas.js";
import { header, renderResponse, type RenderedResponse } from "../format.js";
import { num, pick } from "../i18n/labels.js";
import { resolveLabels } from "../i18n/tools/resolve.js";

export const resolveInputShape = {
    query: z
        .string()
        .min(1)
        .describe(
            "Arabic name fragment to resolve. Use partial names: 'ابن قدامة' resolves Ibn Qudamah, 'الروضة' resolves books with that word in their title.",
        ),
    type: z
        .enum(["any", "book", "author"])
        .default("any")
        .describe("'book' searches the s_book/ index, 'author' searches s_author/, 'any' (default) searches both."),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("Maximum results per type (1–20, default 5)."),
    ...ResponseFormatInput,
};
export const resolveInput = z.object(resolveInputShape).strict();

interface RawHit {
    id: number;
    score: number;
}

export interface ResolveBookHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    score: number;
}

export interface ResolveAuthorHit {
    author_id: number;
    author_name: string;
    death_year: number | null;
    book_count: number;
    score: number;
}

export interface ResolveOutput {
    query: string;
    normalized_tokens: string[];
    books: ResolveBookHit[];
    authors: ResolveAuthorHit[];
}

export async function runResolve(
    helper: Helper,
    catalog: Catalog,
    args: z.infer<typeof resolveInput>,
): Promise<RenderedResponse<ResolveOutput>> {
    const raw = await helper.request<{
        query: string;
        normalized_tokens: string[];
        books: RawHit[];
        authors: RawHit[];
    }>("resolve", { query: args.query, type: args.type, limit: args.limit });

    const books: ResolveBookHit[] = raw.books.map((h) => {
        const rec = catalog.bookRecord(h.id);
        return {
            book_id: h.id,
            book_name: rec?.book_name ?? `(unknown ${h.id})`,
            author_name: rec ? catalog.mainAuthorName(rec) : null,
            score: h.score,
        };
    });
    const authors: ResolveAuthorHit[] = raw.authors.map((h) => {
        const rec = catalog.authorRecord(h.id);
        return {
            author_id: h.id,
            author_name: rec?.author_name ?? `(unknown ${h.id})`,
            death_year: rec?.death_year ?? null,
            book_count: catalog.booksByAuthorId(h.id).length,
            score: h.score,
        };
    });
    const out: ResolveOutput = {
        query: raw.query,
        normalized_tokens: raw.normalized_tokens,
        books,
        authors,
    };
    return renderResponse(out, args.response_format, (data) => {
        const L = pick(resolveLabels);
        const lines: string[] = [header(1, L.heading(data.query))];
        if (data.authors.length) {
            lines.push("", header(2, L.authorsHeading(num(data.authors.length))));
            for (const a of data.authors) {
                lines.push(
                    L.authorLine(
                        a.author_name,
                        String(a.author_id),
                        a.death_year ? L.died(num(a.death_year)) : "",
                        num(a.book_count),
                    ),
                );
            }
        }
        if (data.books.length) {
            lines.push("", header(2, L.booksHeading(num(data.books.length))));
            for (const b of data.books) {
                lines.push(
                    L.bookLine(b.book_name, String(b.book_id), b.author_name ? L.byAuthor(b.author_name) : ""),
                );
            }
        }
        if (!data.books.length && !data.authors.length) {
            lines.push("", L.empty);
        }
        return lines.join("\n");
    });
}
