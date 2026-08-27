/**
 * Golden table for the Arabic normalizer.
 *
 * The Lucene indexes are built by Shamela itself and we never rebuild them, so
 * our normalizer has to reproduce Shamela's analyzer character for character: a
 * rule we miss makes every query using it return a silent zero, and a rule we
 * invent does exactly the same. This table pins both directions — the folds we
 * must apply and the ones we must NOT.
 *
 * The expectations were derived from Shamela's own mapping tables and confirmed
 * against a dump of the live index term dictionary; the guard cases below each
 * correspond to a term class that genuinely exists in that dictionary.
 *
 * The Java helper carries the same table (Normalize.java). tests/integration/
 * normalization.test.ts asserts the two agree at runtime.
 */

import { describe, it, expect } from "vitest";

import { normalizeArabic, normalizeArabicAya, tokenizeArabic } from "../../src/server/arabic.js";

describe("normalizeArabic — folds Shamela applies", () => {
    it.each([
        ["مسائل", "مسايل"],
        ["الفرائض", "الفرايض"],
        ["هيئة", "هييه"],
        ["أولئك", "اوليك"],
    ])("rewrites ئ to ي: %s → %s", (input, expected) => {
        expect(normalizeArabic(input)).toBe(expected);
    });

    it.each([
        ["شيء", "شي"],
        ["شئ", "شي"],
        ["شىء", "شي"],
    ])("collapses the شيء spellings: %s → %s", (input, expected) => {
        // «يء» → «ئ» in P5, then «ئ» → «ي» in P8. Wrong pass order gives «شئ».
        expect(normalizeArabic(input)).toBe(expected);
    });

    it.each([
        ["قراءات", "قراءت"],
        ["أبناءه", "ابناءه"],
    ])("applies ءا → ء: %s → %s", (input, expected) => {
        expect(normalizeArabic(input)).toBe(expected);
    });

    it("does not confuse ائ with ءا", () => {
        // إسرائيل has ائ, not ءا — only the later ئ → ي rule touches it.
        expect(normalizeArabic("إسرائيل")).toBe("اسراييل");
    });

    it.each([
        ["الرحمان", "الرحمن"],
        ["سماوات", "سموات"],
        ["إسحاق", "اسحق"],
        ["إسماعيل", "اسمعيل"],
        ["هاذا", "هذا"],
        ["أولائك", "اوليك"],
        ["داوود", "داود"],
        ["طاووس", "طاوس"],
    ])("applies the word-level rules: %s → %s", (input, expected) => {
        expect(normalizeArabic(input)).toBe(expected);
    });

    it("applies مائه mid-word, not just at the start", () => {
        expect(normalizeArabic("دمائه")).toBe("دميه");
        expect(normalizeArabic("مائة")).toBe("ميه"); // ة→ه folds first, then مائه→مئه→ميه
    });

    it.each([
        ["مسؤول", "مسوول"],
        ["مؤمن", "مومن"],
    ])("folds ؤ to و: %s → %s", (input, expected) => {
        expect(normalizeArabic(input)).toBe(expected);
    });

    it.each([
        ["إسلام", "اسلام"],
        ["أحمد", "احمد"],
        ["آمن", "امن"],
        ["مصطفى", "مصطفي"],
        ["مكتبة", "مكتبه"],
        ["محمـ__د".replace("__", ""), "محمد"], // tatweel
        ["مُحَمَّدٌ", "محمد"], // tashkeel
    ])("folds the plain orthographic variants: %s → %s", (input, expected) => {
        expect(normalizeArabic(input)).toBe(expected);
    });

    it("treats decomposed hamza the same as the composed form", () => {
        // NFC first, so ا + U+0654 is أ, which folds to ا.
        expect(normalizeArabic("أمر")).toBe(normalizeArabic("أمر"));
        expect(normalizeArabic("أمر")).toBe("امر");
    });
});

describe("normalizeArabic — folds Shamela does NOT apply (guards against new zeros)", () => {
    it.each(["الوضوء", "جزء", "القضاء", "الفقهاء", "الأنبياء", "ماء"])(
        "keeps a standalone ء: %s",
        (input) => {
            // The live index holds 15,205 terms containing ء. Dropping it here
            // would zero every one of those searches.
            expect(normalizeArabic(input)).toContain("ء");
        },
    );

    it("keeps the Persian ک (U+06A9) — Shamela indexes it verbatim", () => {
        expect(normalizeArabic("کتاب")).toBe("کتاب");
    });

    it("does not apply the aya-only rule ائ → اا on the page path", () => {
        expect(normalizeArabic("ملائكة")).toBe("ملايكه");
        expect(normalizeArabic("خائفين")).toBe("خايفين");
    });

    it("leaves گ پ چ mapped as Shamela maps them", () => {
        expect(normalizeArabic("گپچ")).toBe("كبج");
    });
});

describe("normalizeArabicAya — the Quran index adds ائ → اا", () => {
    it.each([
        ["الملائكة", "الملااكه"],
        ["خائفين", "خاافين"],
    ])("%s → %s", (input, expected) => {
        expect(normalizeArabicAya(input)).toBe(expected);
    });

    it("keeps a standalone ء on the aya path too", () => {
        expect(normalizeArabicAya("الدعاء")).toBe("الدعاء");
    });

    it("agrees with the page table for words with no ائ", () => {
        for (const w of ["الرحمن", "الوضوء", "شيء", "مكتبة", "قراءات"]) {
            expect(normalizeArabicAya(w)).toBe(normalizeArabic(w));
        }
    });
});

describe("tokenizeArabic", () => {
    it("keeps the ابن → بن synonym at token level only", () => {
        expect(tokenizeArabic("قال ابن قدامة")).toEqual(["قال", "بن", "قدامه"]);
        // Not a character mapping: «ابناء» must survive intact.
        expect(tokenizeArabic("ابناء")).toEqual(["ابناء"]);
    });

    it("normalizes each token with the page table", () => {
        expect(tokenizeArabic("مسائل الفرائض")).toEqual(["مسايل", "الفرايض"]);
    });
});
