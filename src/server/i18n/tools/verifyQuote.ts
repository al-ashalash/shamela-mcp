import type { Slice } from "../labels.js";

/**
 * Wording for shamela_verify_quote. Arabic first; English translates it.
 *
 * The verdict lines are the whole tool. They are written to be unusable as
 * cover: «verbatim» never appears without saying WHERE on the page, and
 * «not found» never appears without saying what was searched — a reader who
 * quotes the first without the second, or repeats the third as «the quotation
 * is fabricated», has been misled by this file rather than by the library.
 */
export const verifyQuoteLabels: Slice<{
    heading: string;
    /** The finding itself, in one line the reader cannot misread. */
    verdict: Record<"verbatim" | "differs" | "partial" | "not_found" | "unverifiable", string>;
    /** What was examined — a verdict is worthless without its scope. */
    checkedLine: Record<"claimed_page" | "claimed_book" | "library" | "nothing", (book: string, books: string) => string>;
    locationsHeading: (count: string) => string;
    /** Where on the page the wording sits. */
    fieldLabel: Record<"body" | "foot" | "comment", string>;
    verbatimMark: string;
    differsMark: (axes: string[]) => string;
    /** A page carrying part of the quotation and not the rest. */
    partialLead: string;
    /** How much of the quotation this page carries, when not all of it. */
    partialMark: (matched: string, total: string) => string;
    /** Names of the three axes a quotation and a page can disagree on. */
    axis: Record<"diacritics" | "hamza" | "digits" | "wording", string>;
    printedPage: (page: string) => string;
    /** The page id given was the printed number of a different page. */
    confusionLine: (given: string, ids: string[]) => string;
    notes: Record<
        | "unknown_book"
        | "claim_book_not_downloaded"
        | "printed_page_confusion"
        | "found_in_footnote"
        | "partial_wording"
        | "auto_numbered"
        | "verbatim_is_folded"
        | "candidates_capped"
        | "not_found_here",
        string
    >;
    /** The index cannot tell these words from other words; named, not hidden. */
    hamzaCaveat: (words: string[]) => string;
    suggestionsHeading: string;
    suggestions: string[];
}> = {
    ar: {
        heading: "تحقّق من نصّ منقول",
        verdict: {
            verbatim: "**النصّ ثابتٌ بحروفه** — بالتشكيل والهمز والأرقام كما كُتب.",
            differs:
                "**النصّ ثابتٌ كلُّه، مختلفٌ في الرسم** — والفروق مسمّاةٌ مع كل موضع أدناه، فانظر أهي من اختلاف الطبعات أم من خطأ النقل.",
            partial:
                "**وُجد بعضُ النصّ لا كلُّه** — والصفحة تقول في سائره غيرَ ما نُقل. وليس هذا تصحيحًا للنقل ولا تكذيبًا له؛ فقابل لفظ الصفحة بما عندك، ثم أحِل بلفظها هي.",
            not_found: "**لم يوجد النصّ فيما فُحص** — وهذا خبرٌ عمّا فُحص، لا حكمٌ على النصّ.",
            unverifiable: "**لم يُفحص شيء** — الكتاب المعزوّ إليه غير منزَّل على هذا الجهاز، فليس في هذا الجواب نفيٌ ولا إثبات.",
        },
        checkedLine: {
            claimed_page: (book) => `فُحصت الصفحة المعزوّ إليها من «${book}» وحدها.`,
            claimed_book: (book) => `فُحص كتاب «${book}» كلُّه.`,
            library: (_book, books) => `فُحص ${books} كتابًا من المنزَّل على هذا الجهاز؛ والفهرس لا يشمل غيرها.`,
            nothing: (book) => `الكتاب المعزوّ إليه «${book}» غير منزَّل، فلم يُفتح شيء.`,
        },
        locationsHeading: (count) => `المواضع (${count})`,
        fieldLabel: {
            body: "في المتن",
            foot: "في الحاشية — وهي كلام المحقِّق لا المؤلِّف",
            comment: "في التعليق",
        },
        verbatimMark: "مطابقٌ بحروفه",
        partialLead: "بعضُه فحسب",
        differsMark: (axes) => `مختلفٌ في: ${axes.join("، ")}`,
        axis: {
            diacritics: "التشكيل",
            hamza: "رسم الهمزة والألف",
            digits: "نظام الأرقام",
            wording: "اللفظ نفسه — فالصفحة تقول غير ما نُقل",
        },
        partialMark: (matched, total) => `${matched} من ${total} كلمة متتابعةً`,
        printedPage: (page) => ` (ص ${page})`,
        confusionLine: (given, ids) =>
            `الرقم ${given} رقمُ الصفحة المطبوعة لا معرِّفُ الصفحة: النصّ ليس في page_id=${given}، وهو في ${ids.join("، ")} — وهذه أكثر عللِ الإحالة المنقولة باليد.`,
        notes: {
            unknown_book: "لا يعرف فهرس الشاملة كتابًا بهذا المعرِّف؛ فتثبَّت منه بـ shamela_resolve أو shamela_search_books.",
            claim_book_not_downloaded:
                "الكتاب المعزوّ إليه غير منزَّل على هذا الجهاز، فلم يُفحص شيء — وليس في الجواب نفيٌ ولا إثبات. انظر shamela_suggest_download.",
            printed_page_confusion:
                "المواضع أدناه من الصفحة التي رقمُها المطبوع هو الرقم المعطى؛ فصحِّح الإحالة إلى معرِّف الصفحة أو إلى رقمها المطبوع صراحةً.",
            partial_wording:
                "من المواضع ما وافق النصَّ في بعضه متتابعًا لا في كلّه: فالصفحة تقول غير ما نُقل عنها في سائره — وهذا شأن المنقول بالمعنى أو المنقول عن حفظ. فالمقتطف أدناه لفظُ الصفحة نفسها، فقابله بما عندك.",
            found_in_footnote:
                "من المواضع ما هو في الحاشية: وهي كلام محقِّق الطبعة، فنسبتها إلى المؤلِّف خطأٌ في العزو ولو طابق اللفظ حرفًا بحرف.",
            candidates_capped:
                "المرشَّحون أكثر من أن يُفحصوا كلُّهم، فقُصر الفحص على أولهم؛ فضيِّق بـ book_id أو scope إن أردت استقصاءً.",
            auto_numbered:
                "ترقيم هذا الكتاب من الشاملة نفسها لا من مطبوعةٍ، فرقم الصفحة المذكور لا يوافق نسخةً مطبوعة؛ فأحِل بمعرِّف الصفحة أو بالرابط.",
            verbatim_is_folded:
                "و«بحروفه» هنا: بعد إسقاط التطويل وعلامات الترقيم وتوحيد المسافات ونزع وسوم العرض — فهي من صنعة الطبع لا من لفظ المؤلِّف؛ وما سوى ذلك من تشكيلٍ وهمزٍ وأرقامٍ قوبل كما كُتب.",
            not_found_here:
                "وقد يكون اللفظ في كتابٍ غير منزَّل، أو في طبعةٍ أخرى، أو منقولًا بالمعنى؛ فجرِّب أدلَّ قطعةٍ منه وحدها بـ shamela_search_phrase.",
        },
        hamzaCaveat: (words) =>
            `تنبيه: فهرس الشاملة يُذيب الهمزة في «يء»، فـ${words.map((w) => `«${w}»`).join(" و")} في الفهرس لفظٌ واحد مع نظيره بلا همزة؛ فقد تأتي مواضع لفظُها غيرُ لفظك. والتمييز في المقتطف نفسه لا في العدد.`,
        suggestionsHeading: "**ولم يوجد — فجرِّب:**",
        suggestions: [
            "اقتصر على أدلّ قطعة من النصّ (أربع كلمات أو خمس)؛ فالنقل بالمعنى يغيّر ما حولها ويبقيها.",
            "shamela_search_phrase بـ mode='near' يكفيه تقارب الكلمات لا تتابعها.",
            "إن كنت تنتظره في كتابٍ بعينه فتحقّق من تنزيله بـ shamela_suggest_download؛ فالبحث لا يشمل غير المنزَّل.",
        ],
    },
    en: {
        heading: "Quotation check",
        verdict: {
            verbatim: "**The wording is there, letter for letter** — diacritics, hamza spelling and digits as written.",
            differs:
                "**All of it is there, but not as written** — the differences are named with each place below; judge whether they are an edition's or a copyist's.",
            partial:
                "**Part of it was found, not the whole** — the page words the rest differently. This neither confirms the quotation nor refutes it: compare the page's wording with yours, then cite the page's.",
            not_found: "**Not found in what was examined** — which is a statement about what was examined, not a verdict on the quotation.",
            unverifiable: "**Nothing was examined** — the book it is credited to is not on this machine, so this answer neither confirms nor denies.",
        },
        checkedLine: {
            claimed_page: (book) => `Only the page it is credited to, in "${book}", was examined.`,
            claimed_book: (book) => `The whole of "${book}" was examined.`,
            library: (_book, books) => `${books} books downloaded on this machine were examined; the index covers nothing else.`,
            nothing: (book) => `The book it is credited to, "${book}", is not downloaded, so nothing was opened.`,
        },
        locationsHeading: (count) => `Places (${count})`,
        fieldLabel: {
            body: "in the matn (the author's text)",
            foot: "in the hashiya — the modern editor's footnote, not the author",
            comment: "in the commentary field",
        },
        verbatimMark: "matches letter for letter",
        partialLead: "part of it only",
        differsMark: (axes) => `differs in: ${axes.join(", ")}`,
        axis: {
            diacritics: "diacritics",
            hamza: "hamza and alef spelling",
            digits: "digit system",
            wording: "the wording itself — the page says something else",
        },
        partialMark: (matched, total) => `${matched} of ${total} words, consecutively`,
        printedPage: (page) => ` (p. ${page})`,
        confusionLine: (given, ids) =>
            `${given} is the PRINTED page number, not the page id: the wording is not on page_id=${given}, and it is on ${ids.join(", ")} — the commonest fault in a hand-carried citation.`,
        notes: {
            unknown_book: "Shamela's catalogue has no book with that id; confirm it with shamela_resolve or shamela_search_books.",
            claim_book_not_downloaded:
                "The book it is credited to is not on this machine, so nothing was examined — this answer neither confirms nor denies. See shamela_suggest_download.",
            printed_page_confusion:
                "The places below are on the page whose PRINTED number is the one given; correct the citation to the page id, or say plainly that the number is the printed one.",
            partial_wording:
                "Some places carry part of the quotation consecutively, not all of it: the page says something else in the rest — which is what a quotation reported by sense, or from memory, looks like. The excerpt below is the page's own wording; compare it with what you have.",
            found_in_footnote:
                "Some places are in the footnote: that is the edition's editor speaking, so attributing it to the author is a misattribution however exactly the words match.",
            candidates_capped:
                "There were more candidate pages than could be examined, so only the first were; narrow with book_id or scope for an exhaustive check.",
            auto_numbered:
                "Shamela numbered this book itself rather than following a printed edition, so the page number above matches no printed copy; cite the page id or the link instead.",
            verbatim_is_folded:
                "\"Letter for letter\" here means after tatweel, punctuation, run-together whitespace and display tags are set aside — the edition's furniture, not the author's wording; everything else, diacritics and hamza and digits, was compared as written.",
            not_found_here:
                "It may be in a book that is not downloaded, in another edition, or reported by sense rather than quoted; try its most distinctive fragment alone with shamela_search_phrase.",
        },
        // The caveat is ABOUT two Arabic spellings collapsing into one index
        // term, and no English sentence can say which spellings without
        // printing them.
        // i18n:arabic-intentional
        hamzaCaveat: (words) =>
            `Note: Shamela's index dissolves the hamza in «يء», so ${words.map((w) => `«${w}»`).join(" and ")} share one index term with the hamza-less word; places may come back whose wording is not yours. The excerpt tells them apart, not the count.`,
        suggestionsHeading: "**Not found — try:**",
        suggestions: [
            "Keep only the most distinctive fragment (four or five words): a paraphrase changes what surrounds it and keeps that.",
            "shamela_search_phrase with mode='near', which needs the words close rather than consecutive.",
            "If you expect it in one particular book, check that it is downloaded with shamela_suggest_download — the search covers nothing else.",
        ],
    },
};

export type VerifyNoteKey = keyof (typeof verifyQuoteLabels)["ar"]["notes"];
