import type { Slice } from "../labels.js";

/**
 * Wording for shamela_scan_consensus. Arabic first; English translates it.
 *
 * The reading note is the most important string in this file. Everything the
 * tool returns is a count of where an idiom is WRITTEN, and a reader who takes
 * the ijmaa column for a finding of ijmaa has been misled by this file rather
 * than by the library — so the note says what the number is, what it is not,
 * and what would have to be read to know.
 */
export const scanConsensusLabels: Slice<{
    heading: (question: string) => string;
    /** How many pages carry the subject at all, and how much was searched. */
    subjectLine: (pages: string, books: string, scoped: boolean) => string;
    readingNote: string;
    familyHeading: Record<"ijmaa" | "khilaf", string>;
    /** How many of the family's formulas turned up, and in how many books. */
    familyTotal: (present: string, total: string, books: string) => string;
    tableHead: string;
    tableRule: string;
    /** The four school categories, named. */
    madhhab: Record<"hanafi" | "maliki" | "shafii" | "hanbali", string>;
    /** Said once under the table: the school columns do not add up to the total. */
    madhhabNote: string;
    witnessHeading: string;
    byAuthor: (name: string) => string;
    printedPage: (page: string) => string;
    footnoteTag: string;
    caveatsHeading: string;
    /** Why a particular formula is weaker evidence than its count suggests. */
    formulaCaveat: Record<"also_other_senses" | "topic_not_claim", string>;
    caveats: Record<"flagged" | "footnotes" | "nothingAtAll" | "windowed", string>;
    suggestions: string[];
}> = {
    ar: {
        heading: (question) => `مواضع تحرير النزاع: «${question}»`,
        subjectLine: (pages, books, scoped) =>
            scoped
                ? `المسألة في **${pages}** صفحة من ${books} كتابًا مبحوثًا.`
                : `المسألة في **${pages}** صفحة من ${books} كتابًا منزَّلًا على هذا الجهاز.`,
        readingNote:
            "هذه الأعداد مواضعُ كُتبت فيها الصيغة قرب المسألة، لا حكمٌ بإجماعٍ ولا بخلاف. فالفهرس لا يرى النفي ولا العزو ولا الردّ: «لا إجماع في المسألة» و«ادعى الإجماع وليس كذلك» تحملان الصيغة ولا تثبتانها. والشواهد أدناه هي الدليل، والعدد موضعُ نظرٍ لا نتيجة.",
        familyHeading: { ijmaa: "صيغ الاتفاق", khilaf: "صيغ الخلاف" },
        familyTotal: (present, total, books) =>
            `وردت ${present} من ${total} صيغة، في ${books} كتابًا. (ولا يُجمع عدد الصفحات بين الصيغ: الصفحة الواحدة قد تحمل صيغتين.)`,
        tableHead: "| الصيغة | صفحات مع المسألة | كتب | الصيغة وحدها في النطاق | المذاهب |",
        tableRule: "|---|---|---|---|---|",
        madhhab: { hanafi: "حنفي", maliki: "مالكي", shafii: "شافعي", hanbali: "حنبلي" },
        madhhabNote:
            "وعمود المذاهب لا يستوفي العدد: إنما هو تصنيفات الفقه الأربعة وحدها، وكتب الفقه العام والأصول والفتاوى خارجةٌ عنها قصدًا.",
        witnessHeading: "الشواهد",
        byAuthor: (name) => ` — ${name}`,
        printedPage: (page) => ` (ص ${page})`,
        footnoteTag: " — **في الحاشية، والقائل محقِّق الطبعة**",
        caveatsHeading: "قيود",
        formulaCaveat: {
            also_other_senses: "للصيغة معنًى آخر شائع، فعددها أعلى من دلالتها",
            topic_not_claim: "لفظ الباب لا دعوى الإجماع، ويستعمله نافي الإجماع كما يستعمله مثبِته",
        },
        caveats: {
            flagged:
                "الصيغ المعلَّمة بـ⚠️ عددها أعلى من دلالتها — إما لأن لها معنًى آخر شائعًا، وإما لأنها لفظ الباب لا دعوى فيه؛ فلا تُبنَ عليها وحدها.",
            footnotes:
                "شمل البحث الحواشي، وصيغةُ الإجماع في الحاشية دعوى محقِّق الطبعة لا دعوى المؤلِّف — وهما في الاحتجاج ليسا سواء.",
            nothingAtAll:
                "لم توافق صيغةٌ المسألةَ في هذا النطاق: قد تكون المسألة بلفظٍ آخر، أو تكون كتبها غير منزَّلة، أو تكون المسافة أضيق من أن تجمع الصيغة بالمسألة.",
            windowed:
                "الصفوف الموسومة بـ~ لم يُستوفَ فيها عدُّ الكتب والمذاهب: المطابقات أكثر من أن تُمشى في المهلة، فعدد الصفحات دقيقٌ وعمودا الكتب والمذاهب عيّنةٌ من نافذةٍ صغيرة لا استيفاء.",
        },
        suggestions: [
            "جرِّب اللفظ الذي يعنون به الفقهاء المسألة، لا وصفها («المسح على الخفين» لا «حكم مسح الجوارب»).",
            "وسِّع `distance`؛ فالصيغة قد تتقدّم المسألة بسطرٍ كامل.",
            "أو ابحث في المسألة نفسها بـ shamela_search_pages ثم اقرأ ما حولها.",
        ],
    },
    en: {
        heading: (question) => `Where the dispute is located: "${question}"`,
        subjectLine: (pages, books, scoped) =>
            scoped
                ? `The subject is on **${pages}** pages across the ${books} books searched.`
                : `The subject is on **${pages}** pages across the ${books} books downloaded on this machine.`,
        readingNote:
            "These are counts of pages where the formula is WRITTEN near the subject — not a finding of consensus, and not a finding of dispute. The index cannot see negation, attribution or rebuttal: «there is no ijmaa here» and «he claimed ijmaa, wrongly» both carry the formula and neither asserts it. The witnesses below are the evidence; the count is only where to look.",
        familyHeading: { ijmaa: "Formulas of agreement", khilaf: "Formulas of disagreement" },
        familyTotal: (present, total, books) =>
            `${present} of ${total} formulas occur, across ${books} books. (Pages are not summed across formulas: one page may carry two.)`,
        tableHead: "| Formula | Pages with the subject | Books | The formula alone, in scope | Schools |",
        tableRule: "|---|---|---|---|---|",
        madhhab: { hanafi: "Hanafi", maliki: "Maliki", shafii: "Shafii", hanbali: "Hanbali" },
        madhhabNote:
            "The schools column does not add up to the total: it counts the four fiqh categories alone, and books of general fiqh, usul and fatwa are deliberately outside them.",
        witnessHeading: "Witnesses",
        byAuthor: (name) => ` — ${name}`,
        printedPage: (page) => ` (p. ${page})`,
        footnoteTag: " — **in the footnote: the edition's editor, not the author**",
        caveatsHeading: "Limits",
        formulaCaveat: {
            also_other_senses: "the phrase has another common sense, so its count runs ahead of its evidence",
            topic_not_claim: "the topic word, not a claim — used as readily by whoever denies the ijmaa as by whoever asserts it",
        },
        caveats: {
            flagged:
                "Formulas marked ⚠️ count higher than they prove — either the phrase has another common sense, or it names the topic rather than making a claim. Do not rest a conclusion on them alone.",
            footnotes:
                "Footnotes were searched, and a consensus formula in a footnote is the modern editor's claim, not the author's — not the same thing in an argument.",
            nothingAtAll:
                "No formula met the subject in this scope: the question may be named differently, its books may not be downloaded, or the distance may be too narrow to bring the two together.",
            windowed:
                "Rows marked ~ did not finish the book/school walk: there were more matches than the time budget allows, so the page count is exact while the books and schools columns are a small-window sample, not a survey.",
        },
        suggestions: [
            "Use the phrase the jurists title the question with, not a description of it.",
            "Widen `distance`: the formula can stand a full line away from the subject.",
            "Or search the subject itself with shamela_search_pages and read around the hits.",
        ],
    },
};
