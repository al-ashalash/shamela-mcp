import { z } from "zod";

import type { Helper } from "../helper.js";

export const searchBooksInput = {
    query: z.string().describe("Arabic search phrase, matched against book name + author + bibliography."),
    max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of hits to return (1-100, default 20)."),
};

export interface SearchBookHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    snippet: string;
}

export interface SearchBooksOutput {
    total_hits: number;
    returned: number;
    query: string;
    normalized_tokens: string[];
    results: SearchBookHit[];
}

export async function searchBooks(
    helper: Helper,
    args: { query: string; max_results: number },
): Promise<SearchBooksOutput> {
    return helper.request<SearchBooksOutput>("search_books", args);
}
