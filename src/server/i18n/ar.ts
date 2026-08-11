/**
 * The Arabic catalogue — and the definition of what a catalogue must contain.
 *
 * Arabic is not one locale among several here: it is the source text, written
 * first and edited first, and every other language is a translation of it. The
 * shape of this object is exported as `Messages`, so a locale that forgets a
 * key does not fall back quietly at runtime — it fails to compile.
 */

import { guideAr } from "./guide.ar.js";

export const ar = {
    /** Server instructions: what the model is told before it does anything. */
    instructions: `أنت متصل بمكتبة المستخدم المحلية من «المكتبة الشاملة» للقراءة فقط. التزم بما يلي:
- لا تنسب نصًّا إلى كتابٍ إلا إذا جاء فعلًا من نتيجة أداة؛ ولا تُكمِل النصوص أو الأسانيد من معرفتك العامة.
- ميِّز دائمًا بين المتن (body) والحاشية (foot)؛ الحاشية كلام المحقِّق أو المعلِّق لا كلام المصنِّف، فلا تنسبها إليه.
- عند الاستشهاد استعمل أداة shamela_get_citation، وصرِّح بحال الترقيم إن كان «بترقيم الشاملة آليًّا» ولا تَعُدَّه ترقيم المطبوع.
- لا تختلق بيانات نشرٍ (ناشر/طبعة/محقِّق) غير موجودة؛ إذا نقصت فاذكر أنها غير متوفرة.
- البحث يقتصر على الكتب المنزَّلة على جهاز المستخدم؛ إن لم تظهر نتائج فقد لا يكون الكتاب منزَّلًا.
- للبحث عن عبارةٍ متتاليةٍ بالضبط أو كلمتين متقاربتين استعمل shamela_search_phrase بدل shamela_search_pages.
- لا تُغرِق المستخدم بنصٍّ طويل: get_page يقطّع المتن (body_part / body_total_parts / body_has_more)، وget_pages_range وget_book_section يقفان عند ميزانية الحجم ويُرجعان next_start_page_id؛ متى طال النص فاعرضه على أجزاء أو اسأل المستخدم عن طريقة العرض (انظر الحقل _display).
- المكتبة الشاملة متعددة التصنيفات (41 تصنيفًا، وكتب التفسير وحدها موزَّعة على التصنيفات 3 و4 و5)؛ فضيّق نطاق البحث والتصفّح بالتصنيف المناسب عبر category_id.
- للتفسير: أداة get_tafseer_of_aya فهرسها منتقًى؛ فلبيان تغطية التفاسير المنزَّلة لآيةٍ بعينها استعمل shamela_list_tafsirs_for_aya، ولجلب النصوص من عدة مصادر دفعةً واحدة shamela_get_tafseer_texts (تفاصيل القيود في وصف كل أداة).
- لا تحكم على حديثٍ بصحةٍ ولا ضعفٍ من عندك؛ إنما تنقل حكمًا وجدته في نتيجة أداة (كتخريج المحقق في الحاشية) منسوبًا إلى قائله، وتُصرِّح بأنه لم يرد إن لم يرد.
- قبل البحث في مسألة: استوثق من صيغتها ومصطلحها عند أهل الفن، وميّز المعلوم من المطلوب، واستفصل من المستخدم إن كان السؤال محتملًا لأكثر من معنًى — فالبحث بمصطلحٍ خاطئ يعيد صفرًا صادقًا عن سؤالٍ لم يُطرح.
- في المقارنة بين المذاهب: ابحث في تصنيف كل مذهب على حدة (لا في تصنيف واحد) حتى لا يُنسب إلى مذهبٍ ما لم تبحث فيه أصلًا، وصرِّح بأي مذهب لم تجد فيه نصًّا.
- الحياد الترجيحي: اعرض أقوال المذاهب منسوبةً بأدلتها دون ترجيح إلا أن يطلبه المستخدم.
- ميِّز في عرضك بين ثلاثة: نصٍّ منقولٍ بحروفه (بين قوسين)، وخلاصةٍ لكلام المصنِّف بعبارتك، واستنباطٍ منك أنت — ولا تُقدِّم الثالث في صورة الأول.
- في الكتب التراثية ذات الفصول غير المعنونة (فهارسها «فصل» مكررة بلا عناوين) لا تكتفِ بـ get_toc للتنقل؛ اجمعه مع shamela_search_pages محصورًا بالكتاب عبر scope.book_ids.
- أداة shamela_guide تعرض دليل استخدام الإضافة عند سؤال المستخدم عن قدراتها أو طريقة استخدامها (ولو بلفظ عام كـ«مساعدة» أو «كيف أبحث» أو «اشرح لي الإضافة»)، وللمستخدم الجديد أو الطلب الأول الغامض يناسب عرض قسمٍ موجز من الدليل أولًا.`,

    /** The developer-facing data-model summary behind shamela://schema. */
    schemaDoc: `# مخطط بيانات المكتبة الشاملة (موجز للمطوّرين)
- **master.db**: فهرس الكتب والمؤلفين والتصنيفات. الجدول \\\`book\\\`: book_id, book_name, book_category, book_date, authors, major_ondisk (الكتاب مُنزَّل إن > 0).
- **book/<id%1000>/<id>.db**: قاعدة كل كتاب. الجدول \\\`page\\\` (id, part, page, number, services) والجدول \\\`title\\\` (فهرس الأبواب).
- **service/{tafseer,hadeeth,trajim}.db**: جداول الربط — \\\`service(key_id, book_id, page_id)\\\` و\\\`inservice(book, user_excluded)\\\`. key_id = aya_id للتفسير، ومفتاح الحديث للحديث. (ملاحظة: هذه الجداول منتقاة ولا تغطي كل التفاسير المنزّلة.)
- **فهارس Lucene**: نصوص الصفحات (body/foot/comment) والعناوين والمؤلفين والآيات — يقرؤها المساعد الجافي.
- القراءة فقط؛ لا تُكتب ملفات الشاملة أبدًا.`,

    /** The user guide the extension carries about itself. */
    guide: guideAr,

    guideUnknownSection: (requested: string, available: string[]) =>
        `القسم المطلوب «${requested}» غير معروف؛ الأقسام المتاحة: ${available.join("، ")} — وقد عُرض الدليل كاملًا.`,

    /** Tool titles, as the client shows them. Descriptions stay English: they
     *  are read by the model, not by the user. */
    toolTitles: {
        shamela_search_pages: "بحث في صفحات الكتب",
        shamela_search_titles: "بحث في عناوين الفصول",
        shamela_search_books: "بحث في فهرس الكتب",
        shamela_search_authors: "بحث في فهرس المؤلفين",
        shamela_get_page: "جلب صفحة",
        shamela_get_toc: "جلب فهرس الكتاب",
        shamela_get_book: "جلب بيانات كتاب",
        shamela_get_author: "جلب بيانات مؤلف",
        shamela_list_categories: "قائمة التصنيفات",
        shamela_resolve: "تحويل اسم إلى معرِّف",
        shamela_get_pages_range: "جلب نطاق صفحات",
        shamela_get_book_section: "جلب باب من كتاب",
        shamela_get_citation: "صياغة إحالة",
        shamela_search_quran: "بحث في القرآن",
        shamela_get_aya: "جلب آية",
        shamela_get_tafseer_of_aya: "تفاسير آية",
        shamela_get_books_for_hadith: "كتب تتضمَّن حديثًا",
        shamela_list_downloaded_books: "قائمة الكتب المنزَّلة",
        shamela_get_book_parts: "أجزاء الكتاب",
        shamela_get_page_services: "إشارات الصفحة",
        shamela_search_phrase: "بحث بالعبارة والتقارب",
        shamela_search_hadith: "بحث عن حديث بنصه",
        shamela_health: "فحص خادم الشاملة",
        shamela_search_exact: "بحث مطابق مع التشكيل والهمزات والأرقام",
        shamela_search_boolean: "بحث منطقي (و/أو/دون)",
        shamela_root_stats: "انتشار جذر في المكتبة",
        shamela_books_by_period: "كتب حسب المدة (تأليفًا ووفاةً)",
        shamela_list_tafsirs_for_aya: "تغطية تفاسير آية",
        shamela_get_tafseer_texts: "جلب نصوص تفسير آية",
        shamela_guide: "دليل استخدام الإضافة",
        shamela_suggest_download: "إرشاد لتنزيل كتاب غير موجود",
        shamela_dump_book: "تصدير الكتاب كاملًا",
    },

    resources: {
        categories: { title: "تصنيفات المكتبة", description: "تصنيفات الشاملة الـ41 مع عدد الكتب." },
        downloaded: { title: "الكتب المنزَّلة", description: "الكتب المنزَّلة فعليًّا على هذا الجهاز (المتاحة للبحث)." },
        guide: { title: "دليل استخدام الإضافة", description: "دليل المستخدم: كل أداة بأمثلة طلبات طبيعية، ونصائح الباحث — بلغة الإضافة المختارة." },
        schema: { title: "مخطط بيانات الشاملة", description: "وصف موجز لبنية بيانات الشاملة للمطوّرين." },
        status: { title: "حالة خادم الشاملة", description: "فحص ذاتي: النسخة والعدّادات وقابلية القراءة." },
    },

    errors: {
        bookNotFound: (bookId: number) => `الكتاب رقم ${bookId} غير موجود في الفهرس.`,
        bookNotDownloaded: (name: string) =>
            `الكتاب ${name} غير منزَّل محليًّا. نزِّله من تطبيق المكتبة الشاملة أولًا.`,
        bookIndexPending: (name: string) =>
            `الكتاب ${name} نُزِّل أثناء هذه الجلسة، ومحرِّك البحث يقرأ فهارسه عند بدايتها. ` +
            `أعد تشغيل تطبيق كلود لقراءة نصِّه؛ وبياناته وفهرسه متاحة الآن.`,
        bookRefNamed: (bookName: string, bookId: number) => `«${bookName}» (${bookId})`,
        bookRefBare: (bookId: number) => `رقم ${bookId}`,
        authorNotFound: (authorId: number) => `المؤلف رقم ${authorId} غير موجود في الفهرس.`,
        categoryNotFound: (categoryId: number) => `التصنيف رقم ${categoryId} غير موجود.`,
        pageNotFound: (bookId: number, pageId: number) =>
            `الصفحة رقم ${pageId} غير موجودة في الكتاب ${bookId}.`,
        titleNotFound: (bookId: number, titleId: number) =>
            `العنوان رقم ${titleId} غير موجود في الكتاب ${bookId}.`,
        emptyScope: (lines: string) => `النطاق المحدَّد لا يشمل أي كتاب. تشخيص:\n${lines}`,
        engineTooOld: (installRoot: string) =>
            `نسخة برنامج «المكتبة الشاملة» المثبَّتة في ${installRoot} أقدم من أن تُشغِّل محرك البحث الذي تحتاجه الإضافة. ` +
            `حدِّث برنامج المكتبة الشاملة إلى أحدث إصدار، ثم أعد تشغيل تطبيق كلود. ` +
            `(الإضافة تستعمل محرك البحث المرفق مع البرنامج نفسه، ولا تحمل نسخة خاصة بها.)`,
        indexNotReady: (detail: string) =>
            `تعذَّر فتح فهارس البحث الخاصة بالمكتبة الشاملة. ` +
            `تأكَّد أن البرنامج ليس في أثناء تنزيل كتاب أو إعادة بناء فهرس، ثم أعد المحاولة. ` +
            `التفصيل التقني: ${detail}`,
        serviceKeyNotFound: (service: string, key: number) =>
            `لا توجد كتب مفهرسة للمفتاح ${key} في خدمة ${service}.`,
    },
};

/**
 * The shape every locale must fill. Derived from Arabic, never hand-written —
 * so a key added above and forgotten in a translation is a compile error, not a
 * blank string in somebody's session.
 *
 * Deliberately no `as const`: the catalogue is a set of strings, not a set of
 * those particular strings, and a translation must be free to differ.
 */
export type Messages = typeof ar;
