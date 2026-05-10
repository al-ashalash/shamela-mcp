import { z } from "zod";

import type { Catalog } from "../catalog.js";
import { bookNotFound } from "../errors.js";
import type { PageStore } from "../pages.js";
import { ResponseFormatInput } from "../schemas.js";
import { renderResponse, type RenderedResponse, header, meta, arabize } from "../format.js";

export const getBookInputShape = {
    book_id: z.number().int().positive().describe("The book id (e.g. 9942)."),
    ...ResponseFormatInput,
};
export const getBookInput = z.object(getBookInputShape).strict();

export interface AuthorEntry {
    author_id: number;
    author_name: string;
    death_year: number | null;
    role: "main" | "co";
}

export interface GetBookOutput {
    book_id: number;
    book_name: string;
    category_id: number | null;
    category: string | null;
    book_type: number;
    book_type_label: string;
    book_date: number | null;
    printed: number;
    available: boolean;
    downloaded: boolean;
    authors: AuthorEntry[];
    pdf_links: string | null;
    publication_date: string | null;
    sub_books: number[];
    notes: string[];
}

const TYPE_LABELS: Record<number, string> = {
    1: "كتاب",
    2: "مجلة",
    3: "مخطوط",
    4: "رسالة جامعية",
    5: "إلكتروني",
    6: "صوتي",
};

export async function runGetBook(
    catalog: Catalog,
    pages: PageStore,
    args: z.infer<typeof getBookInput>,
): Promise<RenderedResponse<GetBookOutput>> {
    const rec = catalog.bookRecord(args.book_id);
    if (!rec) throw bookNotFound(args.book_id);
    const authors = catalog.bookAuthors(rec).map((a, idx) => ({
        author_id: a.author_id,
        author_name: a.author_name,
        death_year: a.death_year,
        role: idx === 0 ? ("main" as const) : ("co" as const),
    }));
    // Bug #3: master.db.book.major_ondisk can flip true while the per-book
    // SQLite is still empty (e.g. mid-download or interrupted state).
    // Honest `downloaded` = catalog flag AND content exists on disk.
    const downloaded = rec.major_ondisk > 0 && (await pages.bookHasContent(rec.book_id));
    const out: GetBookOutput = {
        book_id: rec.book_id,
        book_name: rec.book_name,
        category_id: rec.book_category,
        category: catalog.categoryPath(rec.book_category)[0] ?? null,
        book_type: rec.book_type,
        book_type_label: TYPE_LABELS[rec.book_type] ?? "غير معروف",
        book_date: rec.book_date,
        printed: rec.printed,
        available: rec.major_online > 0,
        downloaded,
        authors,
        pdf_links: rec.pdf_links,
        publication_date: rec.meta_data?.date ?? null,
        sub_books: rec.meta_data?.sub_books ?? [],
        notes: [
            "edition number not available in master.db",
            "publisher not available in master.db",
            "city of publication not available in master.db",
            "editor / muḥaqqiq not available in master.db",
        ],
    };
    return renderResponse(out, args.response_format, (data) => {
        const lines = [header(1, data.book_name)];
        lines.push(`- **المعرِّف**: ${data.book_id}`);
        if (data.authors.length) {
            const main = data.authors.find((a) => a.role === "main") ?? data.authors[0]!;
            lines.push(
                `- **المؤلف**: ${main.author_name}` +
                    (main.death_year ? ` (ت ${arabize(main.death_year)}هـ)` : ""),
            );
            const cos = data.authors.filter((a) => a.role === "co");
            if (cos.length) {
                lines.push(`- **مشاركون**: ${cos.map((a) => a.author_name).join("، ")}`);
            }
        }
        if (data.category) lines.push(`- **التصنيف**: ${data.category}`);
        lines.push(`- **النوع**: ${data.book_type_label}`);
        if (data.book_date) lines.push(`- **سنة التأليف**: ${arabize(data.book_date)}هـ`);
        lines.push(`- **منزَّل محليًّا**: ${data.downloaded ? "نعم" : "لا"}`);
        if (data.publication_date) lines.push(`- **تاريخ النشر بالشاملة**: ${data.publication_date}`);
        if (data.notes.length) {
            lines.push("", "**ملاحظات على البيانات المتاحة**:");
            for (const n of data.notes) lines.push(`- ${n}`);
        }
        return lines.join("\n");
    });
}
