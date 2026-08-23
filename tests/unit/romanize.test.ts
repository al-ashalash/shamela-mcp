/**
 * Latin spellings, against the names as Shamela actually writes them.
 *
 * The names on the left are copied from master.db; the spellings on the right
 * are the ones that appear in Western bibliographies, footnotes and reading
 * lists. Nothing here consults an index — this is the comparison alone.
 */

import { describe, it, expect } from "vitest";

import {
    arabicNameTokens,
    compareMatches,
    isLatinQuery,
    latinKeys,
    latinQueryTokens,
    matchName,
} from "../../src/server/romanize.js";

/** Does this Latin query name this Arabic name? */
function hits(query: string, name: string): boolean {
    return matchName(latinQueryTokens(query), arabicNameTokens(name)) !== null;
}

describe("a Latin query is recognised as one", () => {
    it("accepts Latin, refuses Arabic and refuses a mixture", () => {
        expect(isLatinQuery("Ibn Qudama")).toBe(true);
        expect(isLatinQuery("al-Mughni")).toBe(true);
        expect(isLatinQuery("المغني")).toBe(false);
        // Mixed input still has an Arabic word, and the Arabic index answers
        // that better than any transliteration can.
        expect(isLatinQuery("Ibn قدامة")).toBe(false);
        expect(isLatinQuery("1447")).toBe(false);
    });
});

describe("the spellings a reader actually types reach the book", () => {
    const cases: Array<[string, string]> = [
        ["Mughni", "المغني"],
        ["al-Mughni", "المغني"],
        ["Ibn Qudama", "ابن قدامة"],
        ["Ibn Qudamah", "ابن قدامة"],
        ["Bukhari", "البخاري"],
        ["al-Bukhari", "محمد بن إسماعيل البخاري"],
        ["Sahih Muslim", "صحيح مسلم"],
        ["Sahih al-Bukhari", "صحيح البخاري"],
        ["Ghazali", "الغزالي"],
        ["Ihya Ulum al-Din", "إحياء علوم الدين"],
        ["Fath al-Bari", "فتح الباري"],
        ["Tafsir Ibn Kathir", "تفسير ابن كثير"],
        ["Ibn Taymiyya", "ابن تيمية"],
        ["Ibn Taymiyyah", "ابن تيمية"],
        ["Nawawi", "النووي"],
        ["Muwatta", "الموطأ"],
        ["Musnad Ahmad", "مسند أحمد"],
        ["Tirmidhi", "الترمذي"],
        ["Qurtubi", "القرطبي"],
        ["Tabari", "الطبري"],
        ["Zad al-Maad", "زاد المعاد"],
        ["Bidayat al-Mujtahid", "بداية المجتهد"],
        ["Risala", "الرسالة"],
        ["Muqaddima", "المقدمة"],
        ["Ibn Hajar", "ابن حجر"],
        ["Abu Dawud", "أبو داود"],
        ["Ishaq", "إسحاق"],
        ["Uthman", "عثمان"],
        ["Dhahabi", "الذهبي"],
        ["Rawd al-Murbi", "الروض المربع"],
    ];
    for (const [latin, arabic] of cases) {
        it(`«${latin}» → «${arabic}»`, () => {
            expect(hits(latin, arabic)).toBe(true);
        });
    }
});

describe("more than one romanisation of the same name", () => {
    // ALA-LC with its diacritics, the plain typing that drops them, and the
    // older spellings that are still all over the literature.
    it("accepts the dotted forms and the undotted ones alike", () => {
        for (const q of ["Ṭabarī", "Tabari", "Tabary"]) {
            expect(hits(q, "الطبري"), q).toBe(true);
        }
        for (const q of ["Ḥanbal", "Hanbal"]) {
            expect(hits(q, "أحمد بن حنبل"), q).toBe(true);
        }
        for (const q of ["Qurʾan", "Quran", "Qur'an", "Koran"]) {
            expect(hits(q, "القرآن"), q).toBe(true);
        }
    });

    it("accepts «dh» and «z» for ذ, «th» and «t» for ث", () => {
        expect(hits("Dhahabi", "الذهبي")).toBe(true);
        expect(hits("Zahabi", "الذهبي")).toBe(true);
        expect(hits("Uthman", "عثمان")).toBe(true);
        expect(hits("Othman", "عثمان")).toBe(true);
    });

    it("survives gemination the Arabic never writes", () => {
        // Shadda is not a letter, so «Wahhab» has one ه too many for «الوهاب».
        expect(hits("Wahhab", "الوهاب")).toBe(true);
        expect(hits("Wahab", "الوهاب")).toBe(true);
        expect(hits("Muqaddimah", "المقدمة")).toBe(true);
    });
});

describe("what it refuses", () => {
    it("does not answer a different name", () => {
        expect(hits("Tabrizi", "الطبري")).toBe(false);
        expect(hits("Mughni", "المغنيات")).toBe(false);
        expect(hits("Bukhari", "مسلم")).toBe(false);
        expect(hits("Ghazali", "الغزو")).toBe(false);
    });

    it("requires every word of the query to land", () => {
        // A two-word query that only matches one word has identified nothing.
        expect(hits("Sahih Muslim", "صحيح البخاري")).toBe(false);
        expect(hits("Tafsir al-Tabari", "تفسير القرطبي")).toBe(false);
    });

    it("refuses a fragment too thin to mean anything", () => {
        // One consonant after the vowels go: «Ali» is «l», «Abu» is «b».
        expect(latinQueryTokens("Ali")).toHaveLength(0);
        expect(latinQueryTokens("Abu")).toHaveLength(0);
        // …and the article alone is grammar, not a name.
        expect(latinQueryTokens("al")).toHaveLength(0);
        expect(latinQueryTokens("the")).toHaveLength(0);
    });

    it("stops at a leftover letter, when the leftover is a consonant", () => {
        // Consuming the name whole is the guard, and it holds wherever what is
        // left over had to be written: the ت of «المغنيات» is a consonant no
        // romanisation of «Mughni» would have dropped.
        expect(hits("Mughni", "المغنيات")).toBe(false);
        // And it holds where the confusion is real and costly: al-Tabari the
        // exegete and al-Tabarani the hadith master are two men, and the ن is
        // the whole difference between their names.
        expect(hits("Tabari", "الطبراني")).toBe(false);
        expect(hits("Tabarani", "الطبراني")).toBe(true);
        // Vowel-letters are droppable, but not without limit: a spelling has
        // to account for more of the name than it leaves behind. «Nawa» leaves
        // half of «النووي» unspelled, which makes it a different word rather
        // than a shorter spelling of this one.
        expect(hits("Nawa", "النووي")).toBe(false);
        expect(hits("Nawawi", "النووي")).toBe(true);
    });
});

describe("the ranking prefers the name that was actually spelled", () => {
    it("puts an exactly spelled word above a loosely matched one", () => {
        const q = latinQueryTokens("Bukhari");
        const exact = matchName(q, arabicNameTokens("البخاري"));
        const loose = matchName(q, arabicNameTokens("البخاري الشافعي المكي"));
        expect(exact).not.toBeNull();
        expect(loose).not.toBeNull();
        // Same word matched; the second name says more the query never asked for.
        expect(compareMatches(exact!, loose!)).toBeLessThan(0);
    });

    it("counts the words the name adds beyond the query", () => {
        const q = latinQueryTokens("Sahih Muslim");
        const m = matchName(q, arabicNameTokens("صحيح مسلم"));
        expect(m!.extra).toBe(0);
        // Both words of the title are spelled out: nothing of the Arabic is
        // left unaccounted for.
        expect(m!.skipped).toBe(0);
        expect(m!.aligned).toBe(8);
    });
});

describe("branching on an ambiguous pair of letters", () => {
    it("reads «sh» as ش and as س+ح, and keeps both", () => {
        // The vowels are present as weak classes: y for i, ' for a.
        const keys = latinKeys("ishaq");
        expect(keys).toContain("ys'k"); // ش
        expect(keys).toContain("ysh'k"); // س + ح
    });

    it("reads «kh» as خ and as ك+ه", () => {
        const keys = latinKeys("khan");
        expect(keys).toContain("x'n");
        expect(keys).toContain("kh'n");
    });

    it("does not branch where there is nothing to choose", () => {
        // «gh» is غ and nothing else; one reading, one key.
        expect(latinKeys("ghazali")).toEqual(["g'z'ly"]);
    });
});
