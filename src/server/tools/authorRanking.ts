/**
 * Putting the scholar you named above the scholars who merely mention him.
 *
 * The author index is a BIOGRAPHY index: Lucene scores the bio text, and the
 * author's own name is not a field in it — it lives in master.db, on this
 * side. So «ابن قدامة» was answered by scoring bios, and because the matching
 * bios score alike, Lucene fell back to document order. Measured:
 *
 *   shamela_search_authors({query:'ابن قدامة'})  ->  52 hits, in this order
 *     54  ابن تيمية                  (bio matches «بن» only)
 *     79  ابن عبد الهادي             (bio matches «بن» only)
 *     159 محمد خليل هراس             («ولابن قدامة كتاب في سيرته»)
 *     160 شهاب الدين العسكري
 *     164 عبد الله بن عبد المحسن التركي  («تحقيق كتاب المغني لابن قدامة»)
 *     474 ابن قدامة                  <- the man himself, sixth
 *
 * — strictly ascending by author_id, twice, on two different queries.
 *
 * That is worse than a bad sort. The tool's own description says to take the
 * author_id and pass it as scope.author_ids to search_pages, so a caller
 * trusting the first row scopes an entire subsequent search to Ibn Taymiyyah
 * while believing it is scoped to Ibn Qudamah — and every conclusion drawn
 * from it is about the wrong man, with nothing anywhere to say so.
 *
 * A name match is ranked above a biography match. Within a tier the engine's
 * own order is preserved, so relevance inside the bios is not thrown away.
 */

import { normalizeArabic } from "../arabic.js";

/** How many results are re-ranked before deep paging falls back to index order. */
export const RERANK_POOL = 100;

export interface RankableAuthor {
    author_id: number;
    author_name: string;
}

/** Normalised, whitespace-collapsed, for comparison only. */
function key(s: string): string {
    return normalizeArabic(s).replace(/\s+/g, " ").trim();
}

/**
 * Lower is better.
 *
 * 0  the name IS the query
 * 1  the name contains the query as a phrase   («ابن قدامة المقدسي»)
 * 2  the name contains every query token       («عبد الله بن قدامة»)
 * 3  the name contains a DISTINCTIVE token     — ordered by how many
 * 9  no name match worth acting on: a biography hit
 *
 * Tokens come from the engine so they are folded exactly as the index folded
 * them — «قدامة» and «قدامه» must not be two different words here.
 *
 * Partial credit needs a token of three characters or more. «بن» sits in half
 * the names in the catalogue, and «من», «في», «أبو» are the same: promoting
 * «ابن تيمية» and «عبد الله بن عبد المحسن التركي» over «محمد خليل هراس»
 * because all three were asked about someone called «ابن» is noise dressed as
 * relevance, and it would shuffle the engine's real ranking for nothing.
 */
const DISTINCTIVE_MIN_CHARS = 3;

export function nameTier(name: string, query: string, tokens: string[]): number {
    const n = key(name);
    if (!n) return 9;
    const q = key(query);
    if (n === q) return 0;
    if (q && n.includes(q)) return 1;
    const usable = tokens.map((t) => key(t)).filter(Boolean);
    if (!usable.length) return 9;
    if (usable.every((t) => n.includes(t))) return 2;
    const distinctive = usable.filter((t) => t.length >= DISTINCTIVE_MIN_CHARS);
    const hit = distinctive.filter((t) => n.includes(t)).length;
    if (hit > 0) return 3 + (distinctive.length - hit) / (distinctive.length + 1);
    return 9;
}

/**
 * Re-order hits so name matches lead, keeping the engine's order within a tier.
 *
 * Stable by construction: the index is carried through the sort, so two hits
 * of equal tier come back in the order the engine ranked them.
 */
export function rankByName<T extends RankableAuthor>(
    hits: T[],
    query: string,
    tokens: string[],
): T[] {
    return hits
        .map((hit, i) => ({ hit, i, tier: nameTier(hit.author_name, query, tokens) }))
        .sort((a, b) => (a.tier === b.tier ? a.i - b.i : a.tier - b.tier))
        .map((x) => x.hit);
}
