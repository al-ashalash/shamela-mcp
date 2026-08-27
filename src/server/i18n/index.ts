/**
 * Which language the extension speaks.
 *
 * Arabic is the default and stays the default: the library is Arabic, the
 * scholarship is Arabic, and a user who sets nothing gets Arabic. The setting
 * exists for a specific reader — someone who reads classical Arabic sources but
 * not modern Arabic interface prose — and it changes how the extension talks,
 * never what it searches or what it returns.
 *
 * The language is read from `SHAMELA_LANG`, which Claude Desktop fills from the
 * extension's own settings (see `user_config.language` in the manifest). It is
 * a free text field rather than a fixed list, so a locale added here works the
 * moment it ships without the manifest having to change too — and a value we do
 * not have falls back to Arabic rather than failing.
 */

import { ar, type Messages } from "./ar.js";
import { en } from "./en.js";

const CATALOGUES = { ar, en } as const;

export type Lang = keyof typeof CATALOGUES;

/** Arabic is not a fallback of last resort; it is the language of the thing. */
export const DEFAULT_LANG: Lang = "ar";

export const SUPPORTED_LANGS = Object.keys(CATALOGUES) as Lang[];

/**
 * Read a language tag the way a person would write it.
 *
 * "EN", "en-US", " en " and "eng" all mean English; anything else means Arabic.
 * A user who mistypes gets the library's own language, which is a working
 * extension — not an error about a setting they did not know they had.
 */
export function resolveLang(raw: string | undefined | null): Lang {
    if (!raw) return DEFAULT_LANG;
    const tag = raw.trim().toLowerCase().replace(/_/g, "-").split("-")[0] ?? "";
    if (tag in CATALOGUES) return tag as Lang;
    // Three-letter forms of the tags we do carry.
    if (tag === "ara") return "ar";
    if (tag === "eng") return "en";
    return DEFAULT_LANG;
}

/** The language for this process, decided once at startup. */
let current: Lang | null = null;

export function currentLang(): Lang {
    if (current === null) current = resolveLang(process.env.SHAMELA_LANG);
    return current;
}

/** Re-read the environment. Exists for tests; nothing in the server calls it. */
export function resetLangForTesting(): void {
    current = null;
}

/** The catalogue for a language, or for this process if none is given. */
export function messages(lang: Lang = currentLang()): Messages {
    return CATALOGUES[lang] ?? ar;
}

export type { Messages };
