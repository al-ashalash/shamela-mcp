/**
 * The catalogue, keyed by how its names are spelled in Latin letters.
 *
 * Built once per catalogue from master.db and nothing else: no table of
 * transliterations to ship, no model, no download, no network. The names are
 * already here; this only holds a second reading of them.
 *
 * It is consulted ONLY when an Arabic index has already returned nothing for a
 * query written in Latin letters. That ordering matters: a transliteration is
 * a guess about spelling, and a guess must never displace a real index hit.
 */

import type { Catalog } from "./catalog.js";
import {
    arabicNameTokens,
    compareMatches,
    latinQueryTokens,
    matchName,
    type NameMatch,
} from "./romanize.js";

/**
 * Ceiling on matches collected before ranking.
 *
 * A one-word query against a common name («Ibn», were it long enough to pass)
 * can touch hundreds of books. The cap bounds the work; the caller is told
 * when it bit, so a truncated list is never read as a complete one.
 */
export const ROMAN_MATCH_CAP = 400;

export interface RomanBookHit {
    book_id: number;
    /** Whether the title alone answered, or the author's name had to be used. */
    via: "title" | "author";
    match: NameMatch;
}

export interface RomanAuthorHit {
    author_id: number;
    match: NameMatch;
}

export interface RomanResult<T> {
    hits: T[];
    /** True when the cap cut the collection short. */
    capped: boolean;
}

interface BookEntry {
    id: number;
    title: string[][];
    author: string[][];
}

interface AuthorEntry {
    id: number;
    tokens: string[][];
}

const CACHE = new WeakMap<Catalog, RomanIndex>();

export class RomanIndex {
    private readonly bookEntries: BookEntry[] = [];
    private readonly authorEntries: AuthorEntry[] = [];

    private constructor(catalog: Catalog) {
        const authorTokens = new Map<number, string[][]>();
        for (const a of catalog.allAuthors()) {
            const tokens = arabicNameTokens(a.author_name);
            authorTokens.set(a.author_id, tokens);
            if (tokens.length) this.authorEntries.push({ id: a.author_id, tokens });
        }
        for (const b of catalog.allBooks()) {
            const title = arabicNameTokens(b.book_name);
            if (!title.length) continue;
            const author = b.main_author !== null ? (authorTokens.get(b.main_author) ?? []) : [];
            this.bookEntries.push({ id: b.book_id, title, author });
        }
    }

    /** One index per catalogue, built on first use and kept with it. */
    static for(catalog: Catalog): RomanIndex {
        let index = CACHE.get(catalog);
        if (!index) {
            index = new RomanIndex(catalog);
            CACHE.set(catalog, index);
        }
        return index;
    }

    /** Books whose title — or failing that, whose author — the query names. */
    books(query: string): RomanResult<RomanBookHit> {
        const q = latinQueryTokens(query);
        if (!q.length) return { hits: [], capped: false };
        const hits: RomanBookHit[] = [];
        let capped = false;
        for (const entry of this.bookEntries) {
            let match = matchName(q, entry.title);
            let via: "title" | "author" = "title";
            if (!match && entry.author.length) {
                // The author's name is part of how a book is named in a
                // bibliography — «Ibn Qudama, al-Mughni» — and a query that
                // gives only the author is asking for their shelf.
                match = matchName(q, entry.title.concat(entry.author));
                via = "author";
            }
            if (!match) continue;
            if (hits.length >= ROMAN_MATCH_CAP) {
                capped = true;
                break;
            }
            hits.push({ book_id: entry.id, via, match });
        }
        hits.sort(
            (a, b) =>
                (a.via === b.via ? 0 : a.via === "title" ? -1 : 1) ||
                compareMatches(a.match, b.match) ||
                a.book_id - b.book_id,
        );
        return { hits, capped };
    }

    /** Authors whose name the query spells. */
    authors(query: string): RomanResult<RomanAuthorHit> {
        const q = latinQueryTokens(query);
        if (!q.length) return { hits: [], capped: false };
        const hits: RomanAuthorHit[] = [];
        let capped = false;
        for (const entry of this.authorEntries) {
            const match = matchName(q, entry.tokens);
            if (!match) continue;
            if (hits.length >= ROMAN_MATCH_CAP) {
                capped = true;
                break;
            }
            hits.push({ author_id: entry.id, match });
        }
        hits.sort((a, b) => compareMatches(a.match, b.match) || a.author_id - b.author_id);
        return { hits, capped };
    }
}
