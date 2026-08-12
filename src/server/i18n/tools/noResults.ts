import { num, pick, type Slice } from "../labels.js";

/**
 * What to say when a search finds nothing.
 *
 * An empty result used to render as three statistics and stop — including
 * «عرض ٠ ابتداءً من ٠», which answers a question nobody asked. The reader was
 * left to guess between "this wording is not in the tradition" and "this
 * wording is not in the part of the tradition on your disk", and those are very
 * different conclusions to leave a person holding.
 *
 * The download line comes first for every search over page text, and it is the
 * reason this file exists rather than a copy of search_quran's advice. The
 * Qur'an is a fixed corpus of 6,236 ayat: a zero there really does mean the
 * wording is not there in that shape. The page index covers only what the user
 * has downloaded — a minority of the catalogue on most machines — so a zero
 * there is far more often a gap in the library than a gap in the tradition.
 *
 * Which is also why search_books and search_authors get different words: their
 * indexes are catalogue-wide, an undownloaded book is returned with
 * `downloaded: false`, and a download line there would be false comfort.
 */
export const noResultsLabels: Slice<{
    heading: string;
    /** Page-text searches. Ordered by how often each is the real cause. */
    notDownloaded: string;
    widenScope: (books: string) => string;
    tryMorphology: string;
    fewerWords: string;
    /**
     * The one thing each tool can say that no other can. These sit second in
     * the list, so the cap never eats them.
     */
    phraseLoosen: string;
    booleanLoosen: string;
    exactNoCandidates: string;
    exactTooStrict: string;
    titlesUntitled: string;
    hadithFragment: string;
    /** Catalogue-wide searches, which have no download problem to report. */
    headingCatalogue: string;
    booksAdvice: string;
    authorsAdvice: string;
}> = {
    ar: {
        heading: "**لا نتائج — والسبب غالبًا أحد هذه:**",
        notDownloaded:
            "لا يُبحث إلا في نصوص الكتب المنزَّلة على هذا الجهاز، وهي بعض فهرس الشاملة لا كلّه؛ فإن كنت تنتظر هذا الكلام في كتابٍ بعينه فاسأل عنه بـ shamela_suggest_download ليتبيّن أمنزَّلٌ هو أم معروضٌ للتنزيل، أو استعرض ما عندك بـ shamela_list_downloaded_books.",
        widenScope: (books) =>
            `البحث محصور بـ ${books} كتابًا؛ فوسّع النطاق أو احذفه ليشمل المكتبة المنزَّلة كلها.`,
        tryMorphology:
            "الفهرس يخزّن الكلمة بصورتها المكتوبة لا بجذرها؛ فشغّل التحليل الصرفي `options.morphology=true` ليطابق سائر صيغ الجذر، أو اكتب الصيغة كما ترد في النص.",
        fewerWords:
            "كل كلمات البحث يجب أن تجتمع في صفحة واحدة؛ فاحذف العامّ منها وأبقِ أدلَّها على المسألة.",
        phraseLoosen:
            "بحث العبارة يشترط تتابع الكلمات؛ فجرّب `mode='near'` مع `distance` أوسع ليكفي تقاربها، ثم shamela_search_pages إن كفاك اجتماعها في الصفحة على أي ترتيب.",
        booleanLoosen:
            "احذف حدًّا من `all_of` أو انقله إلى `any_of`؛ فحدٌّ واحد لا يوجد يُفرِغ التقاطع كله. وراجع `none_of` فقد يكون هو المستبعِد.",
        exactNoCandidates:
            "لم تُوجد صفحة مرشَّحة أصلًا، فالمسألة في وجود اللفظ لا في ضبطه؛ فابدأ بـ shamela_search_pages ثم ضيِّق.",
        exactTooStrict:
            "اللفظ موجود في المكتبة لكن لا بالصورة التي طلبت ضبطها؛ فأرخِ إحدى رايات `preserve` (التشكيل أو الهمز أو الأرقام)، أو انسخ اللفظ كما هو مثبت في المطبوع.",
        titlesUntitled:
            "كثير من الكتب التراثية فصولها غير معنونة، فقد لا يكون للفصل عنوان في الفهرس أصلًا؛ فابحث في متن الكتاب نفسه بـ shamela_search_pages محصورًا بـ `scope.book_ids`.",
        hadithFragment:
            "اقتصر على أدلّ قطعة من المتن؛ فألفاظ الحديث تختلف بالرواية، والبحث يشترط اجتماع كل الكلمات في صفحة واحدة. ثم جرّب shamela_search_phrase بالقطعة نفسها.",
        headingCatalogue: "**لا نتائج — والبحث هنا في الفهرس كلّه لا في المنزَّل وحده:**",
        booksAdvice:
            "فليس الاسم في الفهرس بهذا الرسم؛ جرّب كلمة واحدة دالّة من العنوان، أو اسم المؤلف بدل العنوان، أو أسقط أداة التعريف، أو استعمل shamela_resolve.",
        authorsAdvice:
            "فليس الاسم في فهرس المؤلفين بهذا الرسم؛ جرّب النسبة وحدها أو الكنية، أو أسقط أداة التعريف، أو استعمل shamela_resolve(type='author').",
    },
    en: {
        heading: "**No results — most often one of these:**",
        notDownloaded:
            "Only the text of books downloaded on this machine is searched, and that is a part of Shamela's catalogue, not all of it. If you expected this wording in a particular book, ask shamela_suggest_download whether it is downloaded or merely offered for download, or list what you do have with shamela_list_downloaded_books.",
        widenScope: (books) =>
            `The search was restricted to ${books} ${books === "1" ? "book" : "books"}; widen the scope or drop it to cover the whole downloaded library.`,
        tryMorphology:
            "The index stores each word as written, not by its root. Turn on the morphological analyzer with `options.morphology=true` so every form of the root matches, or type the form as it actually appears in the text.",
        fewerWords:
            "Every word of the query has to occur on one and the same page. Drop the common words and keep the one or two that are distinctive.",
        phraseLoosen:
            "Phrase search requires the words to be consecutive. Try `mode='near'` with a larger `distance` so proximity is enough, then shamela_search_pages if their merely being on the same page will do.",
        booleanLoosen:
            "Drop a term from `all_of` or move it to `any_of`: one absent term empties the whole intersection. And check `none_of` — it may be what is excluding everything.",
        exactNoCandidates:
            "No candidate page was found at all, so the question is whether the wording occurs, not how it is voweled. Start with shamela_search_pages and tighten afterwards.",
        exactTooStrict:
            "The wording is in the library, but not in the form you asked to be preserved. Relax one of the `preserve` flags (diacritics, hamza, digits), or copy the wording exactly as the printed edition has it.",
        titlesUntitled:
            "In many classical works the chapters are untitled, so the chapter may have no indexed title at all. Search the book's text instead, with shamela_search_pages restricted by `scope.book_ids`.",
        hadithFragment:
            "Keep only the most distinctive fragment of the matn: hadith wording differs from one riwaya to another, and the search requires every word on one page. Then try shamela_search_phrase with that same fragment.",
        headingCatalogue: "**No results — and this searches the whole catalogue, not only what is downloaded:**",
        booksAdvice:
            "So the name is not in the catalogue as spelled. Try one distinctive word of the title, or the author's name instead of the title, or drop the definite article, or use shamela_resolve.",
        authorsAdvice:
            "So the name is not in the author index as spelled. Try the nisba alone or the kunya, or drop the definite article, then shamela_resolve(type='author').",
    },
};

/** What the tool knows about the search that just found nothing. */
export interface NoResultsContext {
    /** Books the search was restricted to, or -1 when it was not restricted. */
    scopeCount?: number;
    /** Whether the tool offers the morphology option, and whether it was on. */
    morphology?: boolean | undefined;
    /** How many words the query normalised to. */
    tokenCount?: number;
    /** The one thing this particular tool can suggest that no other can. */
    toolSpecific?: string;
}

/**
 * Advice for a search over page text, most likely cause first.
 *
 * Capped, and the cap is the point: an advice block longer than the answer is
 * a block readers learn to skip. The tool's own suggestion sits second so it
 * survives the cap — it is the only line here nothing else could have said.
 */
export function pageSearchAdvice(ctx: NoResultsContext): string[] {
    const L = pick(noResultsLabels);
    const out = [L.notDownloaded];
    if (ctx.toolSpecific) out.push(ctx.toolSpecific);
    if (ctx.scopeCount !== undefined && ctx.scopeCount >= 0) out.push(L.widenScope(num(ctx.scopeCount)));
    if (ctx.morphology === false) out.push(L.tryMorphology);
    if ((ctx.tokenCount ?? 0) > 1) out.push(L.fewerWords);
    return out.slice(0, 4);
}

/**
 * Advice for a search over the catalogue rather than over page text.
 *
 * One line, and it opens by ruling out the cause the other advice leads with:
 * these two indexes hold every book Shamela knows of, downloaded or not, so a
 * zero here really is about the spelling.
 */
export function catalogueAdvice(kind: "books" | "authors"): string[] {
    const L = pick(noResultsLabels);
    return [kind === "books" ? L.booksAdvice : L.authorsAdvice];
}
