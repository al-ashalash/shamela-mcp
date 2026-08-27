import type { Slice } from "../labels.js";

/** Wording for shamela_health. Arabic first; English translates it. */
export const healthLabels: Slice<{
    /**
     * The report shown when the extension could not start at all (issue #42).
     * Deliberately says what to DO, not only what failed: the reader of this
     * text is someone for whom every other tool just returned an error.
     */
    notStartedHeading: string;
    notStartedLead: (code: string) => string;
    installRootLine: (root: string) => string;
    catalogStillReadable: (books: string, downloaded: string) => string;
    catalogUnreadable: string;
    heading: (status: string) => string;
    ok: string;
    degraded: string;
    serverVersion: (version: string) => string;
    /**
     * Which Shamela folder answered, and on whose word. The path stays Latin
     * in both languages: it is typed back into the settings field.
     */
    installRootUsed: (root: string, source: string) => string;
    sourceSetting: string;
    sourceRegistry: string;
    sourceAuto: string;
    /**
     * Said when the folder the user set was rejected and resolution fell back
     * to a discovered install. The fallback is deliberate — a typo must not
     * brick the extension — but recovering in silence is how someone with two
     * Shamela copies reads from the one they did not ask for.
     */
    noteSettingRejected: (setPath: string, reason: string, used: string) => string;
    counts: (books: string, authors: string, categories: string) => string;
    downloaded: (count: string) => string;
    flaggedMissing: (count: string) => string;
    orphanFiles: (count: string) => string;
    diskScanFellBack: string;
    spotCheck: (readable: string, sampled: string, unreadable: string) => string;
    unreadableIds: (ids: string) => string;
    idSeparator: string;
    searchIndex: (docs: string) => string;
    unavailable: string;
    pageDocs: (count: string) => string;
    bookDocs: (count: string) => string;
    authorDocs: (count: string) => string;
    probe: (query: string, result: string) => string;
    probeFailed: (error: string) => string;
    probeHits: (count: string) => string;
    notesHeading: string;
    /**
     * The notes themselves — every sentence health can say about what it found.
     *
     * They were English literals in the renderer, so an Arabic reader met the
     * translated heading «ملاحظات» and then nine English sentences. None of
     * them is a diagnostic anyone needs verbatim: every machine fact a bug
     * report would quote already travels in a typed field — `search_index.error`
     * carries the engine's own message, `startup_error` its code, and
     * `readable_spot_check.unreadable_book_ids` the very ids the note re-prints
     * as prose. What is left is advice, and advice is read.
     */
    noteNoneReadable: string;
    noteSomeUnreadable: (ids: string) => string;
    noteNoDownloads: string;
    noteFlaggedMissing: (count: string) => string;
    noteDiskScanFellBack: string;
    noteEngineWarmup: string;
    noteIndexEmpty: string;
    noteProbeNoHits: (query: string) => string;
    noteEngineDown: string;
}> = {
    ar: {
        notStartedHeading: "الإضافة لم تبدأ",
        notStartedLead: (code) =>
            `تعذَّر تشغيل الإضافة، فكل أداة ستُرجع الخطأ نفسه حتى يُعالَج السبب (الرمز: ${code}).`,
        installRootLine: (root) => `مجلد الشاملة الذي وُجد: \`${root}\``,
        catalogStillReadable: (books, downloaded) =>
            `وفهرس الكتب نفسه يُقرأ: ${books} كتابًا في الفهرس، ${downloaded} منزَّلًا على القرص — فالعطل في محرك البحث لا في مكتبتك.`,
        catalogUnreadable: "ولم يُقرأ فهرس الكتب أيضًا — تأكَّد أن مسار مجلد الشاملة في إعدادات الإضافة صحيح.",
        heading: (status) => `فحص خادم الشاملة — ${status}`,
        ok: "سليم ✅",
        degraded: "متعثر ⚠️",
        serverVersion: (version) => `- **نسخة الخادم**: ${version}`,
        installRootUsed: (root, source) => `- **مجلد الشاملة المقروء**: \`${root}\` (${source})`,
        sourceSetting: "من إعدادات الإضافة",
        sourceRegistry: "من سجل النظام",
        sourceAuto: "اكتُشف تلقائيًّا",
        noteSettingRejected: (setPath, reason, used) =>
            `المجلد المضبوط في إعدادات الإضافة (${setPath}) رُفض: ${reason}. واستُعمل بدلًا منه التثبيت المكتشف في ${used} — صحِّح الحقل أو أفرغه ليزول هذا التنبيه.`,
        counts: (books, authors, categories) =>
            `- **كتب الفهرس**: ${books} — **المؤلفون**: ${authors} — **التصنيفات**: ${categories}`,
        downloaded: (count) => `- **الكتب المنزَّلة**: ${count} (ملفاتها موجودة على القرص)`,
        flaggedMissing: (count) =>
            `- **معلَّمة في الفهرس بلا ملف**: ${count} — تنزيل مبتور أو مجلد مكتبة مُنقَل`,
        orphanFiles: (count) => `- **ملفات كتب خارج الفهرس**: ${count}`,
        diskScanFellBack:
            "- ⚠️ **تعذَّرت قراءة مجلد الكتب**؛ الأعداد أعلاه من علامات الفهرس لا من الملفات",
        spotCheck: (readable, sampled, unreadable) =>
            `- **عيّنة قابلية القراءة**: ${readable} من ${sampled} مقروءة${unreadable}`,
        unreadableIds: (ids) => ` (غير المقروءة: ${ids})`,
        idSeparator: "، ",
        searchIndex: (docs) => `- **فهرس البحث**: ${docs}`,
        unavailable: "غير متاح",
        // «وثيقة» تمييز العدد و«صفحات» مضافٌ إليه، فالسطر الأول صحيح على حاله.
        // أمّا «كتب» و«مؤلفين» فجمعان، والعدد لا يميَّز بالجمع إلا من ٣ إلى ١٠،
        // وعدد وثائق الفهرس بالآلاف أبدًا — فكان يُقرأ «٨٥٩٣ كتب» دائمًا لا في
        // الواحد وحده. والمفرد المنصوب هو صورة هذا الملف الثابتة، وهو الصواب في
        // منزلة ١١–٩٩ التي ينتهي إليها كل رقم من هذا القبيل.
        pageDocs: (count) => `${count} وثيقة صفحات`,
        bookDocs: (count) => ` — ${count} كتابًا`,
        authorDocs: (count) => ` — ${count} مؤلفًا`,
        probe: (query, result) => `- **استعلام تجريبي** «${query}»: ${result}`,
        probeFailed: (error) => `أخفق (${error})`,
        probeHits: (count) => `${count} نتيجة`,
        notesHeading: "**ملاحظات**:",
        noteNoneReadable:
            "لا صفحات مقروءة في أيٍّ من الكتب المنزَّلة التي فُحصت — قد يكون مسار مجلد الشاملة خاطئًا، أو التنزيلات مبتورة.",
        noteSomeUnreadable: (ids) =>
            `كتب منزَّلة لم يجد القارئ فيها صفحات نصّية (أرقامها: ${ids}) — الغالب أنها نسخ مصوَّرة، ويحتمل عجز القارئ عن صيغتها؛ ليس عطلًا في الخادم، ولا يُنقَل عنها. فإن أعاد البحث نصًّا من أحدها فذلك تناقض يستحق بلاغًا.`,
        noteNoDownloads:
            "لا كتب منزَّلة، فالبحث في المتون لن يُرجع شيئًا حتى تُنزَّل كتب من برنامج المكتبة الشاملة.",
        noteFlaggedMissing: (count) =>
            `${count} كتابًا معلَّمة في الفهرس أنها منزَّلة ولا ملف لها على القرص — تنزيل مبتور أو مجلد مكتبة مُنقَل؛ وهي مستثناة من الأعداد أعلاه.`,
        noteDiskScanFellBack:
            "تعذَّرت قراءة مجلد الكتب، فهذه الأعداد من علامات master.db لا من الملفات نفسها — تحقَّق من مسار الشاملة.",
        noteEngineWarmup:
            "محرك البحث (جافا) يُحمَّل عند أول طلب؛ فأجرِ بحثًا صغيرًا ليُختبر من طرفه إلى طرفه.",
        noteIndexEmpty:
            "فهرس الصفحات يُبلِّغ أنه بلا وثائق — إمّا أن الشاملة لم تبنِ فهرس البحث بعد، وإمّا أن المسار يشير إلى موضع لا فهرس فيه.",
        noteProbeNoHits: (query) =>
            `الفهرس مفتوح، لكن كلمة شائعة كـ«${query}» لم تطابق شيئًا — فالبحث سيبدو فارغًا لا معطوبًا؛ نرجو الإبلاغ عن هذا.`,
        noteEngineDown: "محرك البحث لم يستجب، فالبحث سيُخفق حتى يبدأ.",
    },
    en: {
        notStartedHeading: "The extension did not start",
        notStartedLead: (code) =>
            `The extension could not start, so every tool will return this same error until the cause is fixed (code: ${code}).`,
        installRootLine: (root) => `Shamela folder found at: \`${root}\``,
        catalogStillReadable: (books, downloaded) =>
            `The book catalogue itself reads fine: ${books} books in the catalogue, ${downloaded} downloaded on disk — so the fault is in the search engine, not in your library.`,
        catalogUnreadable: "The book catalogue could not be read either — check that the Shamela folder path in the extension's settings is correct.",
        heading: (status) => `Shamela server check — ${status}`,
        ok: "Healthy ✅",
        degraded: "Degraded ⚠️",
        serverVersion: (version) => `- **Server version**: ${version}`,
        installRootUsed: (root, source) => `- **Shamela folder in use**: \`${root}\` (${source})`,
        sourceSetting: "from the extension's settings",
        sourceRegistry: "from the Windows registry",
        sourceAuto: "auto-detected",
        noteSettingRejected: (setPath, reason, used) =>
            `The folder set in the extension's settings (${setPath}) was rejected: ${reason}. The installation found at ${used} was used instead — correct the field, or clear it, and this warning goes away.`,
        counts: (books, authors, categories) =>
            `- **Catalogue books**: ${books} — **Authors**: ${authors} — **Categories**: ${categories}`,
        downloaded: (count) => `- **Downloaded books**: ${count} (files present on disk)`,
        flaggedMissing: (count) =>
            `- **Flagged in the catalogue, no file**: ${count} — an interrupted download, or the library folder moved`,
        orphanFiles: (count) => `- **Book files outside the catalogue**: ${count}`,
        diskScanFellBack:
            "- ⚠️ **The book folder could not be read**; the counts above come from the catalogue flags, not the files",
        spotCheck: (readable, sampled, unreadable) =>
            `- **Readability sample**: ${readable} of ${sampled} readable${unreadable}`,
        unreadableIds: (ids) => ` (unreadable: ${ids})`,
        idSeparator: ", ",
        searchIndex: (docs) => `- **Search index**: ${docs}`,
        unavailable: "unavailable",
        pageDocs: (count) => `${count} page ${plural(count, "document", "documents")}`,
        bookDocs: (count) => ` — ${count} ${plural(count, "book", "books")}`,
        authorDocs: (count) => ` — ${count} ${plural(count, "author", "authors")}`,
        probe: (query, result) => `- **Probe query** "${query}": ${result}`,
        probeFailed: (error) => `failed (${error})`,
        probeHits: (count) => `${count} ${plural(count, "result", "results")}`,
        notesHeading: "**Notes**:",
        noteNoneReadable:
            "NONE of the sampled downloaded books have readable pages — the Shamela database path may be wrong, or downloads are incomplete",
        noteSomeUnreadable: (ids) =>
            `downloaded books in which the reader found no text pages (ids: ${ids}) — most likely image/scan-only titles, though a file format this reader cannot open would look the same; not a server fault, and do not quote from them. If search still returns text from one, that contradiction deserves a bug report`,
        noteNoDownloads:
            "no downloaded books found — page searches will return nothing until books are downloaded in Shamela",
        noteFlaggedMissing: (count) =>
            `${count} book(s) are flagged as downloaded but have no file on disk — interrupted downloads, or the library folder moved; they are excluded from the counts above`,
        noteDiskScanFellBack:
            "the book folder could not be read, so these counts come from master.db's flags rather than the files themselves — check the Shamela path",
        noteEngineWarmup: "the Java search engine warms up lazily; run a small search to exercise it end-to-end",
        noteIndexEmpty:
            "the page index reports zero documents — Shamela has not built its search index yet, or the library path points somewhere without one",
        noteProbeNoHits: (query) =>
            `the search index is open but a word as common as «${query}» matched nothing — searches will look empty rather than broken; please report this`,
        noteEngineDown: "the search engine did not respond — searches will fail until it starts",
    },
};

/** English agrees the noun with the count; the Arabic counted noun does not move. */
function plural(count: string, one: string, many: string): string {
    return count === "1" ? one : many;
}
