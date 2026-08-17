/**
 * Naming the one hamza fold that merges two different words.
 *
 * «يء» → «ئ» → «ي» drops a letter, so Shamela's index holds «بريء» and «بريّ»
 * as the single term «بري», and «شيء» and «شي» as «شي». Measured on the live
 * index: searching «بريء» reports 9,714 hits and returns book 9879 page 44,
 * whose text is «الهِنْدباء: نبات بري معمّر» — a wild plant, and a page where
 * «بريء» does not occur at all.
 *
 * The fold is NOT a bug in this code and must not be "fixed" here. It mirrors
 * the analyzer Shamela built the index with; keeping the hamza in our query
 * would ask for a term that is not in their index and return a confident zero
 * for «بريء» and «شيء» — the exact failure decisions.md §4 records twice. What
 * this guards is the honesty of the surface: a contaminated count must not be
 * presented as an exact one.
 */

import { describe, it, expect } from "vitest";

import { hamzaCollisionWords, normalizeArabic } from "../../src/server/arabic.js";

describe("the fold itself is Shamela's and stays as it is", () => {
    it("still collapses يء exactly as the index does", () => {
        // If any of these change, our queries stop matching the live index.
        expect(normalizeArabic("بريء")).toBe("بري");
        expect(normalizeArabic("شيء")).toBe("شي");
        // …and the collision they create, stated so nobody has to rediscover it
        expect(normalizeArabic("بريّ")).toBe(normalizeArabic("بريء"));
    });

    it("still keeps a hamza that the index keeps", () => {
        // 15,205 live index terms carry a standalone ء. Folding these would be
        // the invented rule that zeroes a whole vocabulary.
        for (const w of ["سوء", "جزء", "العلماء", "الوضوء", "الفقهاء"]) {
            expect(normalizeArabic(w), w).toContain("ء");
        }
    });
});

describe("hamzaCollisionWords", () => {
    it("names the words whose hamza dissolves", () => {
        expect(hamzaCollisionWords("بريء")).toEqual(["بريء"]);
        expect(hamzaCollisionWords("براءة ذمة المكلف من الشيء")).toEqual(["الشيء"]);
    });

    it("says nothing about a hamza the index keeps", () => {
        // ء after ا, ز, و survives, so no lexeme is merged and no caveat is due.
        for (const q of ["سوء", "جزء", "العلماء", "الوضوء", "براءة"]) {
            expect(hamzaCollisionWords(q), q).toEqual([]);
        }
    });

    it("says nothing about ئ inside a word", () => {
        // «المسائل» → «المسايل» keeps a letter in place and lands on a form
        // that is not itself a word, so it merges nothing with anything.
        expect(hamzaCollisionWords("المسائل الفرائض خائفين")).toEqual([]);
    });

    it("reports each affected word once, across a multi-word query", () => {
        expect(hamzaCollisionWords("بريء و بريء و شيء")).toEqual(["بريء", "شيء"]);
    });

    it("is quiet on an empty or hamza-free query", () => {
        expect(hamzaCollisionWords("")).toEqual([]);
        expect(hamzaCollisionWords("الكلام في العقيدة")).toEqual([]);
    });
});
