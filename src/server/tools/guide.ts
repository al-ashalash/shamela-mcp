import { z } from "zod";

import { renderResponse, type RenderedResponse } from "../format.js";
import {
    buildGuideSectionText,
    GUIDE_SECTION_NAMES,
    resolveGuideSection,
    type GuideSectionName,
} from "../guide.js";
import { messages } from "../i18n/index.js";
import { ResponseFormatInput } from "../schemas.js";

export const guideInputShape = {
    section: z
        .string()
        .default("الكل")
        .describe(
            "Which part of the user guide to return. Either language is accepted: 'الكل' / 'all' (default — the whole guide), 'الأدوات' / 'tools' (every tool with example requests in plain language), or 'النصائح' / 'tips' (researcher tips). The guide is rendered in the extension's configured language. An unrecognized value falls back to the whole guide with a note.",
        ),
    ...ResponseFormatInput,
};
export const guideInput = z.object(guideInputShape).strict();

export interface GuideOutput {
    /** The section actually returned (falls back to «الكل» on unknown input). */
    section: GuideSectionName;
    available_sections: string[];
    /**
     * User-facing markdown in the extension's language — present it faithfully,
     * do not summarize.
     */
    text: string;
    notes: string[];
}

/**
 * shamela_guide — the built-in user guide as a model-callable tool. Pure text
 * (no backend): MCP resources cannot be fetched by the model itself, so the
 * shamela://guide resource only helps when the USER attaches it manually;
 * this tool is the reliable in-conversation path.
 */
export function runGuide(args: z.infer<typeof guideInput>): RenderedResponse<GuideOutput> {
    const requested = args.section.trim();
    const notes: string[] = [];
    // A section may be asked for in either language; the Arabic names remain
    // the values the output reports, because they are the declared ones. The
    // resolved name is still checked against the declared list: the alias table
    // is a plain object, so a request for «constructor» or «toString» comes back
    // as an inherited property rather than null, and only this list says what a
    // section actually is.
    const resolved = resolveGuideSection(requested);
    let section: GuideSectionName = "الكل";
    if (resolved !== null && GUIDE_SECTION_NAMES.includes(resolved)) {
        section = resolved;
    } else {
        notes.push(messages().guideUnknownSection(requested, [...GUIDE_SECTION_NAMES]));
    }
    const out: GuideOutput = {
        section,
        available_sections: [...GUIDE_SECTION_NAMES],
        text: buildGuideSectionText(section),
        notes,
    };
    return renderResponse(out, args.response_format, (data) =>
        data.notes.length
            ? `${data.notes.map((n) => `> ${n}`).join("\n")}\n\n${data.text}`
            : data.text,
    );
}
