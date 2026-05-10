import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { authorNotFound } from "../errors.js";
import { ResponseFormatInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header, arabize } from "../format.js";

export const getAuthorInputShape = {
    author_id: z.number().int().positive().describe("The author id (e.g. 57 for Ibn Uthaymeen)."),
    include_books: z
        .boolean()
        .default(true)
        .describe("If true (default), include the list of books authored by this author. Includes co-authored books."),
    ...ResponseFormatInput,
};
export const getAuthorInput = z.object(getAuthorInputShape).strict();

export interface BookByAuthor {
    book_id: number;
    book_name: string;
    book_date: number | null;
    downloaded: boolean;
}

export interface GetAuthorOutput {
    author_id: number;
    author_name: string;
    death_year: number | null;
    death_text: string | null;
    book_count: number;
    books: BookByAuthor[];
}

export function runGetAuthor(
    catalog: Catalog,
    args: z.infer<typeof getAuthorInput>,
): RenderedResponse<GetAuthorOutput> {
    const rec = catalog.authorRecord(args.author_id);
    if (!rec) throw authorNotFound(args.author_id);
    const bookIds = catalog.booksByAuthorId(rec.author_id).sort((a, b) => a - b);
    const books: BookByAuthor[] = args.include_books
        ? bookIds.map((id) => {
              const b = catalog.bookRecord(id);
              return {
                  book_id: id,
                  book_name: b?.book_name ?? `(unknown ${id})`,
                  book_date: b?.book_date ?? null,
                  downloaded: b ? b.major_ondisk > 0 : false,
              };
          })
        : [];
    const out: GetAuthorOutput = {
        author_id: rec.author_id,
        author_name: rec.author_name,
        death_year: rec.death_year,
        death_text: rec.death_text,
        book_count: bookIds.length,
        books,
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, data.author_name)];
        lines.push(`- **المعرِّف**: ${data.author_id}`);
        if (data.death_year) lines.push(`- **سنة الوفاة**: ${arabize(data.death_year)}هـ`);
        else if (data.death_text) lines.push(`- **سنة الوفاة**: ${data.death_text}`);
        lines.push(`- **عدد الكتب**: ${arabize(data.book_count)}`);
        if (args.include_books && data.books.length) {
            lines.push("", header(2, "الكتب"));
            for (const b of data.books) {
                lines.push(
                    `- **${b.book_name}** (id=${b.book_id})${b.book_date ? ` — ${arabize(b.book_date)}هـ` : ""}${b.downloaded ? " — منزَّل" : ""}`,
                );
            }
        }
        return lines.join("\n");
    });
}
