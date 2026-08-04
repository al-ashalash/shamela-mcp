/**
 * Static Quranic metadata: surah names + verse counts.
 * 114 surahs, 6,236 ayat total. Used to validate get_aya inputs and to
 * enrich search_quran results with surah names.
 */

import { normalizeArabic } from "./arabic.js";
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

/** Ayat in a surah, or null for an out-of-range number. */
export function ayatInSurah(surah: number): number | null {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
    return AYAT_PER_SURAH[surah - 1]!;
}

/**
 * Names a surah is filed under in real Shamela books, beyond its standard one.
 *
 * Tafsir authors title their chapters by whatever the surah is commonly called —
 * al-Tawbah as «براءة», Fatir as «الملائكة», al-Qalam as «ن» — and a matcher
 * that only knows the standard names silently skips those chapters. Every entry
 * here was observed in an actual library, not assembled from a reference.
 */
const SURAH_NAME_SYNONYMS: ReadonlyArray<readonly [number, readonly string[]]> = [
    [1, ["ام القران", "فاتحه الكتاب"]],
    [9, ["براءه"]],
    [17, ["بني اسراييل", "سبحان"]],
    [35, ["الملايكه"]],
    [37, ["والصافات"]],
    [38, ["داود"]],
    [53, ["والنجم"]],
    [54, ["اقتربت الساعه", "اقتربت"]],
    [61, ["الحواريين"]],
    [63, ["المنافقين"]],
    [67, ["تبارك"]],
    [68, ["ن", "ن والقلم"]],
    [75, ["القيمه"]],
    [76, ["الدهر", "هل اتي"]],
    [81, ["اذا الشمس كورت"]],
    [92, ["والليل"]],
    [94, ["الانشراح", "الم نشرح"]],
    [98, ["لم يكن"]],
    [100, ["والعاديات"]],
    [103, ["والعصر"]],
    [105, ["الم تر"]],
    [107, ["ارايت"]],
    [111, ["تبت", "ابي لهب", "اللهب"]],
];

/** Normalized surface form → surah number. Built once. */
const SURAH_BY_NAME: ReadonlyMap<string, number> = (() => {
    const m = new Map<string, number>();
    const add = (name: string, surah: number): void => {
        const key = normalizeArabic(name).trim();
        if (key && !m.has(key)) m.set(key, surah);
    };
    SURAH_NAMES.forEach((n, i) => {
        add(n, i + 1);
        // Some books wrap short names in parentheses: «سورة (ص)», «سورة (ن)».
        add(`(${n})`, i + 1);
    });
    for (const [surah, names] of SURAH_NAME_SYNONYMS) {
        for (const n of names) {
            add(n, surah);
            add(`(${n})`, surah);
        }
    }
    return m;
})();

/**
 * Read a surah number out of a chapter title, or null when it is not one.
 *
 * Strips the wrappers Shamela's books put around the name — «تفسير سورة …»,
 * al-Tabari's «القول في تفسير السورة التي يذكر فيها …», a leading ordinal —
 * then looks the remainder up among the standard names and the observed
 * synonyms. The result is treated as a hint elsewhere, never as proof: one
 * library files al-Kawthar under the title «سورة التكوير», so position in the
 * book decides and the name only corroborates.
 */
export function surahFromTitleName(text: string): number | null {
    if (!text) return null;
    let t = normalizeArabic(text).trim();
    t = t.replace(/^[\d٠-٩]+\s*[-–—:]?\s*/, ""); // a leading ordinal
    t = t.replace(/^القول\s+في\s+(تفسير|تاويل)\s+السوره\s+التي\s+يذكر\s+فيها\s*/, "");
    t = t.replace(/^(تفسير|شرح)\s+/, "");
    t = t.replace(/^سوره\s*/, "");
    t = t.replace(/\s*[-–—:].*$/, ""); // trailing "- قوله تعالى…" and the like
    t = t.trim();
    if (!t) return null;
    return SURAH_BY_NAME.get(t) ?? null;
}
