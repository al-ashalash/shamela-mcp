/**
 * Static Quranic metadata: surah names + verse counts.
 * 114 surahs, 6,236 ayat total. Used to validate get_aya inputs and to
 * enrich search_quran results with surah names.
 */

import { QURAN_AYA_COUNT } from "./constants.js";

export interface SurahInfo {
    surah: number;
    surah_name: string;
    ayat: number;
    /** Cumulative aya_id of the LAST aya in this surah (1-based, ends at 6236 for surah 114). */
    end_aya_id: number;
}

// Aya counts per surah (Hafs from `'Asim, Egyptian standard).
const AYAT_PER_SURAH: ReadonlyArray<number> = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109,    // 1..10
    123, 111, 43, 52, 99, 128, 111, 110, 98, 135,    // 11..20
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60,       // 21..30
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85,         // 31..40
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45,          // 41..50
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13,          // 51..60
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44,          // 61..70
    28, 28, 20, 56, 40, 31, 50, 40, 46, 42,          // 71..80
    29, 19, 36, 25, 22, 17, 19, 26, 30, 20,          // 81..90
    15, 21, 11, 8, 8, 19, 5, 8, 8, 11,               // 91..100
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3,                   // 101..110
    5, 4, 5, 6,                                       // 111..114
];

const SURAH_NAMES: ReadonlyArray<string> = [
    "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة",
    "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس",
    "هود", "يوسف", "الرعد", "إبراهيم", "الحجر",
    "النحل", "الإسراء", "الكهف", "مريم", "طه",
    "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان",
    "الشعراء", "النمل", "القصص", "العنكبوت", "الروم",
    "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر",
    "يس", "الصافات", "ص", "الزمر", "غافر",
    "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية",
    "الأحقاف", "محمد", "الفتح", "الحجرات", "ق",
    "الذاريات", "الطور", "النجم", "القمر", "الرحمن",
    "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة",
    "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق",
    "التحريم", "الملك", "القلم", "الحاقة", "المعارج",
    "نوح", "الجن", "المزمل", "المدثر", "القيامة",
    "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس",
    "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج",
    "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد",
    "الشمس", "الليل", "الضحى", "الشرح", "التين",
    "العلق", "القدر", "البينة", "الزلزلة", "العاديات",
    "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل",
    "قريش", "الماعون", "الكوثر", "الكافرون", "النصر",
    "المسد", "الإخلاص", "الفلق", "الناس",
];

// Precompute end_aya_id for each surah.
const SURAH_INFO: ReadonlyArray<SurahInfo> = (() => {
    const out: SurahInfo[] = [];
    let cum = 0;
    for (let i = 0; i < 114; i++) {
        cum += AYAT_PER_SURAH[i]!;
        out.push({
            surah: i + 1,
            surah_name: SURAH_NAMES[i]!,
            ayat: AYAT_PER_SURAH[i]!,
            end_aya_id: cum,
        });
    }
    return out;
})();

/** Convert (surah, aya) to a 1-based aya_id, or return null if invalid. */
export function ayaIdFromSurahAya(surah: number, aya: number): number | null {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
    const info = SURAH_INFO[surah - 1]!;
    if (!Number.isInteger(aya) || aya < 1 || aya > info.ayat) return null;
    return info.end_aya_id - info.ayat + aya;
}

/** Convert a 1-based aya_id back to (surah, aya, surah_name). */
export function surahAyaFromId(ayaId: number): { surah: number; aya: number; surah_name: string } | null {
    if (!Number.isInteger(ayaId) || ayaId < 1 || ayaId > QURAN_AYA_COUNT) return null;
    for (const info of SURAH_INFO) {
        if (ayaId <= info.end_aya_id) {
            const aya = ayaId - (info.end_aya_id - info.ayat);
            return { surah: info.surah, aya, surah_name: info.surah_name };
        }
    }
    return null;
}

export function surahName(surah: number): string | null {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
    return SURAH_NAMES[surah - 1]!;
}

export function listSurahs(): SurahInfo[] {
    return SURAH_INFO.slice();
}
