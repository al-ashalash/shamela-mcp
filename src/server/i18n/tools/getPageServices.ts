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
}> = {
    ar: {
        heading: (pageId, bookId) => `إشارات الصفحة ${pageId} في الكتاب ${bookId}`,
        none: "_لا توجد إشارات (آيات / أحاديث / إسناد) في هذه الصفحة._",
        ayat: (count, ayaIds) => `- **آيات قرآنية**: ${count} (aya_id: ${ayaIds})`,
        hadeeth: (count, keys) => `- **أحاديث**: ${count} (key: ${keys})`,
        esnad: (count) => `- **أسانيد**: ${count}`,
    },
    en: {
        heading: (pageId, bookId) => `Links on page ${pageId} in book ${bookId}`,
        none: "_No links (ayat / hadith / isnad) on this page._",
        ayat: (count, ayaIds) => `- **Qur'anic ayat**: ${count} (aya_id: ${ayaIds})`,
        hadeeth: (count, keys) => `- **Hadiths**: ${count} (key: ${keys})`,
        esnad: (count) => `- **Isnads (chains of transmission)**: ${count}`,
    },
};
