import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
    OptionsInput,
    PaginationInput,
    ResponseFormatInput,
    ScopeInput,
} from "../../src/server/schemas.js";

describe("ScopeInput", () => {
    it("accepts an empty object (downloaded_only defaults to false)", () => {
        expect(ScopeInput.parse({})).toEqual({ downloaded_only: false });
    });

    it("accepts a partial scope", () => {
        expect(ScopeInput.parse({ book_ids: [9942] })).toEqual({
            book_ids: [9942],
            downloaded_only: false,
        });
    });

    it("accepts all keys together", () => {
        const result = ScopeInput.parse({
            book_ids: [9942],
            author_ids: [57],
            category_ids: [17],
            period_from: 1400,
            period_to: 1450,
            downloaded_only: true,
        });
        expect(result.book_ids).toEqual([9942]);
        expect(result.author_ids).toEqual([57]);
        expect(result.downloaded_only).toBe(true);
    });

    it("rejects negative book_ids", () => {
        expect(() => ScopeInput.parse({ book_ids: [-1] })).toThrow();
    });

    it("rejects zero ids (positive() is strict)", () => {
        expect(() => ScopeInput.parse({ author_ids: [0] })).toThrow();
    });

    it("rejects period_from below 1", () => {
        expect(() => ScopeInput.parse({ period_from: 0 })).toThrow();
    });

    it("rejects period_to above 2000", () => {
        expect(() => ScopeInput.parse({ period_to: 2001 })).toThrow();
    });

    it("is strict — rejects unknown keys", () => {
        expect(() => ScopeInput.parse({ unknown_field: 1 })).toThrow();
    });
});

describe("OptionsInput", () => {
    it("defaults all toggles to false and search_in to ['body','foot']", () => {
        const result = OptionsInput.parse({});
        expect(result.morphology).toBe(false);
        expect(result.wildcards).toBe(false);
        expect(result.preserve_diacritics).toBe(false);
        expect(result.preserve_hamza).toBe(false);
        expect(result.preserve_digits).toBe(false);
        expect(result.search_in).toEqual(["body", "foot"]);
    });

    it("treats undefined input as default", () => {
        const result = OptionsInput.parse(undefined);
        expect(result.morphology).toBe(false);
        expect(result.search_in).toEqual(["body", "foot"]);
    });

    it("accepts morphology=true alone", () => {
        const result = OptionsInput.parse({ morphology: true });
        expect(result.morphology).toBe(true);
        expect(result.wildcards).toBe(false);
    });

    it("accepts wildcards=true alone", () => {
        const result = OptionsInput.parse({ wildcards: true });
        expect(result.wildcards).toBe(true);
    });

    it("accepts a custom search_in subset", () => {
        const result = OptionsInput.parse({ search_in: ["body"] });
        expect(result.search_in).toEqual(["body"]);
    });

    it("rejects unknown search_in values", () => {
        expect(() => OptionsInput.parse({ search_in: ["title"] })).toThrow();
    });

    it("is strict — rejects unknown keys", () => {
        expect(() => OptionsInput.parse({ wild_unknown: true })).toThrow();
    });
});

describe("PaginationInput shape", () => {
    const Schema = z.object(PaginationInput);

    it("defaults limit=20 and offset=0", () => {
        expect(Schema.parse({})).toEqual({ limit: 20, offset: 0 });
    });

    it("respects user-supplied values", () => {
        expect(Schema.parse({ limit: 50, offset: 10 })).toEqual({ limit: 50, offset: 10 });
    });

    it("rejects limit below 1", () => {
        expect(() => Schema.parse({ limit: 0 })).toThrow();
    });

    it("rejects limit above MAX_LIMIT (100)", () => {
        expect(() => Schema.parse({ limit: 101 })).toThrow();
    });

    it("rejects negative offset", () => {
        expect(() => Schema.parse({ offset: -1 })).toThrow();
    });

    it("rejects non-integer values", () => {
        expect(() => Schema.parse({ limit: 1.5 })).toThrow();
    });
});

describe("ResponseFormatInput shape", () => {
    const Schema = z.object(ResponseFormatInput);

    it("defaults to markdown", () => {
        expect(Schema.parse({})).toEqual({ response_format: "markdown" });
    });

    it("accepts json", () => {
        expect(Schema.parse({ response_format: "json" })).toEqual({
            response_format: "json",
        });
    });

    it("rejects unknown formats", () => {
        expect(() => Schema.parse({ response_format: "xml" })).toThrow();
    });
});
