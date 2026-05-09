import { z } from "zod";

import type { Helper } from "../helper.js";

export const searchAuthorsInput = {
    query: z.string().describe("Arabic search phrase, matched against author name + biography."),
    max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of hits to return (1-100, default 20)."),
};

export interface SearchAuthorHit {
    author_id: number;
    author_name: string;
    death_year: number | null;
    snippet: string;
}

export interface SearchAuthorsOutput {
    total_hits: number;
    returned: number;
    query: string;
    normalized_tokens: string[];
    results: SearchAuthorHit[];
}

export async function searchAuthors(
    helper: Helper,
    args: { query: string; max_results: number },
): Promise<SearchAuthorsOutput> {
    return helper.request<SearchAuthorsOutput>("search_authors", args);
}
