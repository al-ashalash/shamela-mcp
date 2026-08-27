import type { Slice } from "../labels.js";

/** Wording for shamela_get_aya. Arabic first; English translates it. */
export const getAyaLabels: Slice<{
    heading: (surahName: string, surah: string, aya: string) => string;
    /** The aya in ordinary modern spelling. */
    imlaei: string;
    /** The aya in the mushaf's own orthography, set in the Amiri face. */
    uthmani: string;
}> = {
    ar: {
        heading: (surahName, surah, aya) => `${surahName} ${surah}:${aya}`,
        imlaei: "بالرسم الإملائي",
        uthmani: "بالرسم العثماني (Amiri)",
    },
    en: {
        heading: (surahName, surah, aya) => `${surahName} ${surah}:${aya}`,
        imlaei: "Imla'i rasm (modern spelling)",
        uthmani: "'Uthmani rasm (Amiri)",
    },
};
