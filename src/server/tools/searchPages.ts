import { z } from "zod";

import type { Helper } from "../helper.js";

export const searchPagesInput = {
    query: z.string().describe("Arabic search phrase. Multiple words are AND-combined."),
    max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of hits to return (1-100, default 20)."),
};

export interface SearchPageHit {
    book_id: number;
    book_name: string;
    author_name: string | null;
    page_id: number;
    printed_page: string | null;
    matched_in: string[];
    snippet_body: string;
    snippet_foot: string;
}

export interface SearchPagesOutput {
    total_hits: number;
    returned: number;
    query: string;
    normalized_tokens: string[];
    results: SearchPageHit[];
}

export async function searchPages(
    helper: Helper,
    args: { query: string; max_results: number },
): Promise<SearchPagesOutput> {
    return helper.request<SearchPagesOutput>("search_pages", args);
}
