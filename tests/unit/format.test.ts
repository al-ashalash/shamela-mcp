import { describe, it, expect } from "vitest";

import { CHARACTER_LIMIT, STRUCTURED_LIMIT } from "../../src/server/constants.js";
import {
    arabize,
    header,
    meta,
    renderResponse,
    stripMarkTags,
} from "../../src/server/format.js";

describe("renderResponse", () => {
    it("returns markdown text when format is markdown", () => {
        const payload = { hello: "world" };
        const r = renderResponse(payload, "markdown", () => "## Hello");
        expect(r.content[0]!.type).toBe("text");
        expect(r.content[0]!.text).toBe("## Hello");
        expect(r.structuredContent).toBe(payload);
    });

    it("returns pretty JSON when format is json (renderMarkdown not called)", () => {
        const payload = { a: 1, b: "two" };
        let called = false;
        const r = renderResponse(payload, "json", () => {
            called = true;
            return "should-not-be-used";
        });
        expect(called).toBe(false);
        expect(r.content[0]!.text).toBe(JSON.stringify(payload, null, 2));
        expect(r.structuredContent).toBe(payload);
    });

    it("preserves Arabic text in both formats", () => {
        const payload = { name: "الكلام لغة" };
        const md = renderResponse(payload, "markdown", (d) => `النتيجة: ${d.name}`);
        expect(md.content[0]!.text).toContain("الكلام لغة");
        const json = renderResponse(payload, "json", () => "");
        expect(json.content[0]!.text).toContain("الكلام لغة");
    });

    it("does not stamp truncation flags when text is under the limit", () => {
        const payload = { x: "short" };
        const r = renderResponse(payload, "markdown", () => "short");
        expect(r.structuredContent).toBe(payload);
        expect((r.structuredContent as Record<string, unknown>).truncated).toBeUndefined();
    });

    it("truncates oversized markdown output and stamps truncated:true", () => {
        const big = "a".repeat(CHARACTER_LIMIT + 5_000);
        const payload = { results: big };
        const r = renderResponse(payload, "markdown", () => big);
        expect(r.content[0]!.text.length).toBeLessThan(big.length);
        expect(r.content[0]!.text).toContain("Response truncated");
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.truncated).toBe(true);
        expect(typeof sc.truncation_message).toBe("string");
    });

    it("keeps oversized JSON output inside the limit, and parseable", () => {
        // This case used to assert that JSON was truncated the same way
        // markdown is. It was — by slicing the rendered document at a character
        // offset, which left it ending mid-string and unparseable. The contract
        // now is the opposite: a JSON response is never cut mid-token. It is
        // shrunk structurally if it exceeds STRUCTURED_LIMIT, and rendered
        // compact rather than indented when indentation would overrun.
        const big = "x".repeat(STRUCTURED_LIMIT * 2);
        const payload = { results: big };
        const r = renderResponse(payload, "json", () => "");
        expect(r.content[0]!.text.length).toBeLessThan(JSON.stringify(payload, null, 2).length);
        expect(() => JSON.parse(r.content[0]!.text)).not.toThrow();
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.truncated).toBe(true);
    });

    it("renders JSON compact rather than overrunning the text channel", () => {
        // Well under STRUCTURED_LIMIT, so nothing is dropped — but the indented
        // spelling would exceed the text budget, so the compact one is used.
        const rows = Array.from({ length: 900 }, (_, i) => ({ id: i, name: `اسم ${i}` }));
        const r = renderResponse({ rows }, "json", () => "");
        const sc = r.structuredContent as Record<string, unknown>;
        expect(sc.truncated).toBeUndefined();
        expect((sc.rows as unknown[]).length).toBe(900);
        expect(() => JSON.parse(r.content[0]!.text)).not.toThrow();
        expect(r.content[0]!.text).not.toContain("\n  ");
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
