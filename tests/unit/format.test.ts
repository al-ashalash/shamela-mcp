import { describe, it, expect } from "vitest";

import { CHARACTER_LIMIT } from "../../src/server/constants.js";
import {
    arabize,
    header,
    meta,
    renderResponse,
    stripMarkTags,
    type ResponseBudget,
} from "../../src/server/format.js";
import { resetLangForTesting } from "../../src/server/i18n/index.js";

/** A payload with nothing this module may cut — the commonest declaration. */
const WHOLE = { list: null, advice: "narrow" } as const satisfies ResponseBudget<object>;

describe("renderResponse", () => {
    it("returns markdown text when format is markdown", () => {
        const payload = { hello: "world" };
        const r = renderResponse(payload, "markdown", WHOLE, () => "## Hello");
        expect(r.content[0]!.type).toBe("text");
        expect(r.content[0]!.text).toBe("## Hello");
        expect(r.structuredContent).toBe(payload);
    });

    it("returns pretty JSON when format is json (renderMarkdown not called)", () => {
        const payload = { a: 1, b: "two" };
        let called = false;
        const r = renderResponse(payload, "json", WHOLE, () => {
            called = true;
            return "should-not-be-used";
        });
        expect(called).toBe(false);
        expect(r.content[0]!.text).toBe(JSON.stringify(payload, null, 2));
        expect(r.structuredContent).toBe(payload);
    });

    it("preserves Arabic text in both formats", () => {
        const payload = { name: "الكلام لغة" };
        const md = renderResponse(payload, "markdown", WHOLE, (d) => `النتيجة: ${d.name}`);
        expect(md.content[0]!.text).toContain("الكلام لغة");
        const json = renderResponse(payload, "json", WHOLE, () => "");
        expect(json.content[0]!.text).toContain("الكلام لغة");
    });

    it("does not stamp truncation flags when text is under the limit", () => {
        const payload = { x: "short" };
        const r = renderResponse(payload, "markdown", WHOLE, () => "short");
        expect(r.structuredContent).toBe(payload);
        expect((r.structuredContent as Record<string, unknown>).truncated).toBeUndefined();
    });

    it("leaves an oversized no-list payload whole, flagged in both channels", () => {
        // The old code sliced the TEXT and shipped structuredContent whole —
        // the channel clients read was never capped at all. With no list to
        // cut and no tool-owned budget, the honest move is: data untouched,
        // truncated stamped, and the advice note in the text.
        const big = "a".repeat(CHARACTER_LIMIT + 5_000);
        const payload = { results: big };
        const r = renderResponse(payload, "markdown", WHOLE, () => big);
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.truncated).toBe(true);
        expect(typeof sc.truncation_message).toBe("string");
        expect(sc.results).toBe(big);
        expect(r.content[0]!.text).toContain(sc.truncation_message as string);
    });

    it("keeps the JSON channel parseable however large the payload", () => {
        // The regression that motivated this: the string cut produced invalid
        // JSON — «Bad control character in string literal at position 24800».
        const big = "x".repeat(CHARACTER_LIMIT * 2);
        const payload = { results: big };
        const r = renderResponse(payload, "json", WHOLE, () => "");
        const parsed = JSON.parse(r.content[0]!.text) as Record<string, unknown>;
        expect(parsed.results).toBe(big);
        expect(typeof parsed.truncation_message).toBe("string");
        expect((r.structuredContent as Record<string, unknown>).truncated).toBe(true);
    });
});

describe("stripMarkTags", () => {
    it("converts <mark> to ** for markdown bold", () => {
        expect(stripMarkTags("<mark>الكلام</mark>")).toBe("**الكلام**");
    });

    it("handles multiple matches in one string", () => {
        expect(stripMarkTags("<mark>a</mark> and <mark>b</mark>")).toBe("**a** and **b**");
    });

    it("returns the input unchanged when there are no mark tags", () => {
        expect(stripMarkTags("plain text")).toBe("plain text");
    });

    it("returns empty string for empty input", () => {
        expect(stripMarkTags("")).toBe("");
    });
});

describe("arabize", () => {
    it("converts Western digits to Arabic-Indic", () => {
        expect(arabize(0)).toBe("٠");
        expect(arabize(17)).toBe("١٧");
        expect(arabize(1410)).toBe("١٤١٠");
        expect(arabize(6236)).toBe("٦٢٣٦");
    });

    it("accepts numeric strings", () => {
        expect(arabize("17")).toBe("١٧");
        expect(arabize("0123")).toBe("٠١٢٣");
    });

    it("returns empty string for null/undefined/empty", () => {
        expect(arabize(null)).toBe("");
        expect(arabize(undefined)).toBe("");
        expect(arabize("")).toBe("");
    });

    it("converts only digits, leaving other characters unchanged", () => {
        expect(arabize("ج 5")).toBe("ج ٥");
        expect(arabize("v1.0")).toBe("v١.٠");
    });
});

describe("header", () => {
    it("renders level-1 header", () => {
        expect(header(1, "Title")).toBe("# Title");
    });

    it("renders level-2 header", () => {
        expect(header(2, "Sub")).toBe("## Sub");
    });

    it("renders level-3 header", () => {
        expect(header(3, "Sub-sub")).toBe("### Sub-sub");
    });

    it("preserves Arabic text", () => {
        expect(header(2, "النتائج")).toBe("## النتائج");
    });
});

describe("meta", () => {
    it("renders a labeled bold field", () => {
        expect(meta("Label", "Value")).toBe("- **Label**: Value");
    });

    it("accepts numeric values", () => {
        expect(meta("Count", 42)).toBe("- **Count**: 42");
    });

    it("returns empty string for null/undefined/empty values", () => {
        expect(meta("Label", null)).toBe("");
        expect(meta("Label", undefined)).toBe("");
        expect(meta("Label", "")).toBe("");
    });

    it("preserves Arabic in label and value", () => {
        expect(meta("المؤلف", "ابن عثيمين")).toBe("- **المؤلف**: ابن عثيمين");
    });
});
