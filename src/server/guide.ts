/**
 * The in-app user guide, served two ways: as the shamela://guide resource
 * (which the user attaches by hand) and as the shamela_guide tool — the model
 * cannot fetch a resource itself, so the tool is the reliable in-conversation
 * path.
 *
 * Ordinary users install the .mcpb and never visit the repository, so the
 * extension carries its own guide. The text lives in the language catalogue
 * (src/server/i18n/guide.*.ts); this file is only assembly, which is what lets
 * the integration suite drift-guard it: whatever comes back must name every
 * registered tool.
 */

import { messages } from "./i18n/index.js";

/**
 * The parts of the guide addressable through shamela_guide's `section` input.
 *
 * The Arabic names are the wire values and stay the wire values — they are a
 * declared input, and renaming them would break every caller that learned them.
 * The English names are aliases onto the same parts, so a user reading the
 * guide in English can ask for a section in the language they are reading.
 */
export const GUIDE_SECTION_NAMES = ["الكل", "الأدوات", "النصائح"] as const;
export type GuideSectionName = (typeof GUIDE_SECTION_NAMES)[number];

/** What a caller may type, in either language, for each part. */
// Prototype-free: a plain object answers to "constructor" and "toString" with
// things that are not sections, and resolveGuideSection would hand a caller a
// function where it promised a heading.
const SECTION_ALIASES: Record<string, GuideSectionName> = Object.assign(Object.create(null), {
    "الكل": "الكل",
    all: "الكل",
    full: "الكل",
    "الأدوات": "الأدوات",
    tools: "الأدوات",
    "النصائح": "النصائح",
    tips: "النصائح",
});

/** Resolve what the caller typed to a section, or null if it means nothing. */
export function resolveGuideSection(raw: string): GuideSectionName | null {
    return SECTION_ALIASES[raw.trim().toLowerCase()] ?? SECTION_ALIASES[raw.trim()] ?? null;
}

export function buildGuideText(): string {
    const g = messages().guide;
    return `${g.intro}\n\n${g.tools}\n\n${g.tips}\n`;
}

/**
 * Build one part of the guide. «الكل» returns the whole thing; the others
 * return just their part, heading included.
 */
export function buildGuideSectionText(section: GuideSectionName): string {
    const g = messages().guide;
    switch (section) {
        case "الأدوات":
            return `${g.tools}\n`;
        case "النصائح":
            return `${g.tips}\n`;
        case "الكل":
            return buildGuideText();
    }
}
