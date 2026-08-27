import type { Slice } from "../labels.js";

/**
 * Wording for shamela_research_scope. Arabic first; English translates it.
 *
 * The three status words carry the tool. «سكوت» and «لا يُدرى» are both zeros
 * on the page and opposite conclusions in an argument, and a reader who takes
 * the second for the first has been misled by this file — so they are never
 * abbreviated, never merged, and never rendered as a bare number.
 */
export const researchScopeLabels: Slice<{
    heading: (terms: string) => string;
    searchedLine: (books: string, downloaded: string, scoped: boolean) => string;
    readingNote: string;
    /** The header row grows with the terms; the labels build both halves. */
    tableHead: (terms: string[]) => string;
    tableRule: (termCount: number) => string;
    madhhab: Record<"hanafi" | "maliki" | "shafii" | "hanbali", string>;
    /** What a row's number means. Three words, and they must stay three. */
    status: Record<"found" | "silent" | "not_searched" | "cannot_tell", string>;
    outsideRow: string;
    outsideNote: string;
    booksHeading: string;
    /** What separates items in a list. Arabic's comma is its own character. */
    listSeparator: string;
    caveatsHeading: string;
    caveats: {
        notSearched: string;
        notDownloaded: string;
        silentMeansSilent: string;
        oneWording: string;
        sampled: (terms: string[]) => string;
    };
}> = {
    ar: {
        heading: (terms) => `إيصال تغطية: ${terms}`,
        searchedLine: (books, downloaded, scoped) =>
            scoped
                ? `بُحث في **${books}** كتابًا من ${downloaded} منزَّلًا على هذا الجهاز.`
                : `بُحث في **${books}** كتابًا — وهي كل المنزَّل على هذا الجهاز.`,
        readingNote:
            "الصفر في هذا الجدول ثلاثة أصفار لا صفرٌ واحد: «سكوتٌ» أن كتب المذهب بُحثت ولم تنطق — وهو وحده خبرٌ عن المذهب؛ و«خارج النطاق» أن كتبه عندك والنطاقَ الذي حدّدتَه لم يشملها؛ و«لا يُدرى» أن كتبه ليست عندك أصلًا — وهذان خبران عن بحثك وقرصك لا عن المذهب. فلا تنسب إلى مذهبٍ سكوتًا إلا من صفٍّ يقول «سكوت».",
        tableHead: (terms) => `| المذهب | ${terms.map((t) => `صفحات «${t}»`).join(" | ")} | كتب أصابت | مبحوث / منزَّل / في الفهرس | الحال |`,
        tableRule: (n) => `|---|${"---|".repeat(n)}---|---|---|`,
        madhhab: { hanafi: "حنفي", maliki: "مالكي", shafii: "شافعي", hanbali: "حنبلي" },
        status: {
            found: "موجود",
            silent: "**سكوت** — بُحثت كتبه ولم تنطق",
            not_searched: "**خارج النطاق** — كتبه عندك والنطاقُ لم يشملها",
            cannot_tell: "**لا يُدرى** — لا كتب له عندك",
        },
        outsideRow: "خارج المذاهب الأربعة",
        outsideNote:
            "وصفوف المذاهب لا تستوفي العدد: الشاملة تفرد لكل مذهب تصنيفًا، وتُبقي الفقه العام والأصول والفتاوى خارجها — فالصفّ الأخير هو ما لم تسعه الأربعة.",
        booksHeading: "أكثر الكتب إصابةً في كل مذهب",
        listSeparator: "، ",
        caveatsHeading: "قيود",
        caveats: {
            notSearched:
                "من المذاهب ما استبعد النطاقُ كتبَه من البحث كلَّها؛ فصفُّه «خارج النطاق» لا سكوت — ولا يُنسب إلى مذهبٍ سكوتٌ عن سؤالٍ لم يُطرح على كتبه. وسِّع النطاق أو أسقطه ليدخل.",
            notDownloaded:
                "من المذاهب ما لا كتاب له منزَّلٌ عندك؛ فصفره لا يدلّ على شيء، ولا يصحّ أن يُنقل عنه سكوت. وانظر shamela_suggest_download لتنزيل ما يسدّ الثغرة.",
            silentMeansSilent:
                "و«السكوت» هنا سكوتُ ما عندك من كتب المذهب عن هذا اللفظ بعينه — لا سكوتُ المذهب عن المسألة؛ فقد يعبّر عنها بلفظٍ آخر، فجرّب مرادفاته في `synonyms`.",
            oneWording:
                "قِيس اللفظ الواحد وحده. والمذهب الذي يسمّي المسألة بغير اسمها عندك يظهر ساكتًا وليس بساكت — فأضف مرادفاتٍ في `synonyms` قبل أن تُثبت سكوتًا.",
            sampled: (terms) =>
                `وتوزيعُ ${terms.map((t) => `«${t}»`).join(" و")} عيّنةٌ لا استيفاء: المطابقات أكثر من أن تُحصى في المهلة، فالأعداد دلالةٌ على النسب لا عددٌ تام.`,
        },
    },
    en: {
        heading: (terms) => `Coverage receipt: ${terms}`,
        searchedLine: (books, downloaded, scoped) =>
            scoped
                ? `Searched **${books}** of the ${downloaded} books downloaded on this machine.`
                : `Searched **${books}** books — everything downloaded on this machine.`,
        readingNote:
            "A zero in this table is three different zeros: «silent» means the school's books were searched and none of them says it — the only zero that is evidence about the school; «out of scope» means its books are here and your scope excluded them; «cannot tell» means its books are not here at all — both facts about your sweep and your disk, not about the school. Never report a school as silent except from a row that says silent.",
        tableHead: (terms) => `| School | ${terms.map((t) => `pages "${t}"`).join(" | ")} | Books hit | Searched / downloaded / catalogued | Reading |`,
        tableRule: (n) => `|---|${"---|".repeat(n)}---|---|---|`,
        madhhab: { hanafi: "Hanafi", maliki: "Maliki", shafii: "Shafii", hanbali: "Hanbali" },
        status: {
            found: "found",
            silent: "**silent** — its books were searched and say nothing",
            not_searched: "**out of scope** — its books are here and the scope excluded them",
            cannot_tell: "**cannot tell** — none of its books is here",
        },
        outsideRow: "Outside the four schools",
        outsideNote:
            "The school rows do not add up to the total: Shamela gives each school its own category and leaves general fiqh, usul and the fatwa collections outside them — the last row is what the four do not hold.",
        booksHeading: "The books most often hit, per school",
        listSeparator: ", ",
        caveatsHeading: "Limits",
        caveats: {
            notSearched:
                "At least one school had every one of its books excluded by the scope, so its row reads out-of-scope, not silence — no school may be reported silent about a question its books were never asked. Widen or drop the scope to include it.",
            notDownloaded:
                "At least one school has no book downloaded here, so its zero shows nothing and no silence may be reported from it. See shamela_suggest_download to close the gap.",
            silentMeansSilent:
                "«Silent» here is the silence of the school's books THAT YOU HAVE, about this exact wording — not the school's silence on the question. It may name the thing differently; try its other wordings in `synonyms`.",
            oneWording:
                "Only one wording was measured. A school that calls the question by another name looks silent and is not — add synonyms before concluding silence.",
            sampled: (terms) =>
                `The distribution for ${terms.map((t) => `"${t}"`).join(" and ")} is a sample, not a count: there were more matches than could be walked in the time allowed, so the figures show proportions rather than totals.`,
        },
    },
};
