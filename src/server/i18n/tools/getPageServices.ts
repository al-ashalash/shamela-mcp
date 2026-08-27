import type { Slice } from "../labels.js";

/** Wording for shamela_get_page_services. Arabic first; English translates it. */
export const getPageServicesLabels: Slice<{
    heading: (pageId: string, bookId: string) => string;
    /** Shown when the page carries no markers of any kind. */
    none: string;
    /** The Qur'anic ayat the page cites, and their aya_ids. */
    ayat: (count: string, ayaIds: string) => string;
    /** The hadiths on the page, and their service keys. */
    hadeeth: (count: string, keys: string) => string;
    /** The isnads — chains of transmission — the page carries. */
    esnad: (count: string) => string;
    /**
     * Said beside `raw`, which is returned exactly as Shamela stored it and
     * deliberately NOT parsed. Half-parsing an opaque string into something
     * that looks authoritative is worse than handing it over whole and saying
     * what it is.
     */
    rawNote: string;
}> = {
    ar: {
        heading: (pageId, bookId) => `إشارات الصفحة ${pageId} في الكتاب ${bookId}`,
        none: "_لا توجد إشارات (آيات / أحاديث / إسناد) في هذه الصفحة._",
        ayat: (count, ayaIds) => `- **آيات قرآنية**: ${count} (aya_id: ${ayaIds})`,
        hadeeth: (count, keys) => `- **أحاديث**: ${count} (key: ${keys})`,
        esnad: (count) => `- **أسانيد**: ${count}`,
        rawNote:
            "> *الحقل `raw` كما خزّنته الشاملة حرفًا، ولا تفسّره الإضافة: هو سلسلة إشاراتٍ مرقّمة تفصل بينها فواصل، ودلالةُ كل رمزٍ فيها من اصطلاح برنامج الشاملة نفسه لا من توثيقٍ منشور. فما استُخرج منه بيقين هو المعروض أعلاه (الآيات والأحاديث وعدد الأسانيد)، وما وراء ذلك يحتاج من يعرف اصطلاحهم — ولا يُبنى عليه حكم.*"
    },
    en: {
        heading: (pageId, bookId) => `Links on page ${pageId} in book ${bookId}`,
        none: "_No links (ayat / hadith / isnad) on this page._",
        ayat: (count, ayaIds) => `- **Qur'anic ayat**: ${count} (aya_id: ${ayaIds})`,
        hadeeth: (count, keys) => `- **Hadiths**: ${count} (key: ${keys})`,
        esnad: (count) => `- **Isnads (chains of transmission)**: ${count}`,
        rawNote:
            "> *The `raw` field is exactly what Shamela stored, and this extension deliberately does not interpret it: a delimited string of numbered signals whose symbol meanings come from the Shamela application's own convention, not from published documentation. What could be read out of it with certainty is shown above (verses, hadiths, isnad count); anything beyond that needs someone who knows that convention — do not build a ruling on it.*"
    },
};
