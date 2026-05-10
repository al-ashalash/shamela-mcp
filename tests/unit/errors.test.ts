import { describe, it, expect } from "vitest";

import {
    authorNotFound,
    ayaNotFound,
    badArg,
    bookNotDownloaded,
    bookNotFound,
    categoryNotFound,
    emptyScope,
    errorCode,
    formatErrorMessage,
    optionConflict,
    optionNotSupported,
    pageNotFound,
    serviceKeyNotFound,
    ShamelaError,
    titleNotFound,
} from "../../src/server/errors.js";
import { HelperError } from "../../src/server/helper.js";
import { ShamelaNotFoundError } from "../../src/server/paths.js";

describe("ShamelaError class", () => {
    it("preserves code, message, and data fields", () => {
        const err = new ShamelaError("BAD_ARG", "missing query", { field: "query" });
        expect(err.code).toBe("BAD_ARG");
        expect(err.message).toBe("missing query");
        expect(err.data).toEqual({ field: "query" });
        expect(err.name).toBe("ShamelaError");
        expect(err).toBeInstanceOf(Error);
    });
});

describe("Error factory functions", () => {
    it("bookNotFound returns BOOK_NOT_FOUND with the id in the message", () => {
        const err = bookNotFound(9999);
        expect(err.code).toBe("BOOK_NOT_FOUND");
        expect(err.message).toContain("9999");
    });

    it("bookNotDownloaded returns BOOK_NOT_DOWNLOADED with the id", () => {
        const err = bookNotDownloaded(123);
        expect(err.code).toBe("BOOK_NOT_DOWNLOADED");
        expect(err.message).toContain("123");
    });

    it("bookNotDownloaded includes the book name when provided", () => {
        const err = bookNotDownloaded(9942, "الأصول");
        expect(err.message).toContain("9942");
        expect(err.message).toContain("الأصول");
    });

    it("authorNotFound returns AUTHOR_NOT_FOUND", () => {
        const err = authorNotFound(57);
        expect(err.code).toBe("AUTHOR_NOT_FOUND");
        expect(err.message).toContain("57");
    });

    it("categoryNotFound returns CATEGORY_NOT_FOUND", () => {
        const err = categoryNotFound(8);
        expect(err.code).toBe("CATEGORY_NOT_FOUND");
        expect(err.message).toContain("8");
    });

    it("pageNotFound includes both ids", () => {
        const err = pageNotFound(9942, 17);
        expect(err.code).toBe("PAGE_NOT_FOUND");
        expect(err.message).toContain("9942");
        expect(err.message).toContain("17");
    });

    it("titleNotFound includes both ids", () => {
        const err = titleNotFound(9942, 11);
        expect(err.code).toBe("TITLE_NOT_FOUND");
        expect(err.message).toContain("9942");
        expect(err.message).toContain("11");
    });

    it("ayaNotFound passes through the detail string", () => {
        const err = ayaNotFound("aya_id 9999");
        expect(err.code).toBe("AYA_NOT_FOUND");
        expect(err.message).toContain("9999");
    });

    it("emptyScope returns EMPTY_SCOPE with diagnostics in data", () => {
        const err = emptyScope([
            { source: "book_ids", contributed: 0 },
            { source: "author_ids", contributed: 5 },
        ]);
        expect(err.code).toBe("EMPTY_SCOPE");
        expect(err.message).toContain("book_ids");
        expect(err.message).toContain("author_ids");
        expect(err.data).toEqual({
            diagnostics: [
                { source: "book_ids", contributed: 0 },
                { source: "author_ids", contributed: 5 },
            ],
        });
    });

    it("optionNotSupported returns OPTION_NOT_SUPPORTED with the option name", () => {
        const err = optionNotSupported("preserve_diacritics");
        expect(err.code).toBe("OPTION_NOT_SUPPORTED");
        expect(err.message).toContain("preserve_diacritics");
    });

    it("optionConflict returns OPTION_CONFLICT with the message", () => {
        const err = optionConflict("morphology and wildcards cannot be combined");
        expect(err.code).toBe("OPTION_CONFLICT");
        expect(err.message).toBe("morphology and wildcards cannot be combined");
    });

    it("badArg returns BAD_ARG with the message", () => {
        const err = badArg("query must not be empty");
        expect(err.code).toBe("BAD_ARG");
        expect(err.message).toBe("query must not be empty");
    });

    it("serviceKeyNotFound returns SERVICE_KEY_NOT_FOUND with both fields", () => {
        const err = serviceKeyNotFound("tafseer", 5000);
        expect(err.code).toBe("SERVICE_KEY_NOT_FOUND");
        expect(err.message).toContain("tafseer");
        expect(err.message).toContain("5000");
    });
});

describe("formatErrorMessage", () => {
    it("returns ShamelaError's message", () => {
        expect(formatErrorMessage(new ShamelaError("BAD_ARG", "msg"))).toBe("msg");
    });

    it("returns ShamelaNotFoundError's message", () => {
        const err = new ShamelaNotFoundError([
            { path: "C:\\shamela4", source: "common", reason: "not found" },
        ]);
        expect(formatErrorMessage(err)).toBe(err.message);
    });

    it("prepends HelperError code", () => {
        const err = new HelperError("HELPER_TIMEOUT", "took too long");
        expect(formatErrorMessage(err)).toBe("HELPER_TIMEOUT: took too long");
    });

    it("returns plain Error message", () => {
        expect(formatErrorMessage(new Error("plain"))).toBe("plain");
    });

    it("stringifies non-Error values", () => {
        expect(formatErrorMessage("oops")).toBe("oops");
        expect(formatErrorMessage(42)).toBe("42");
        expect(formatErrorMessage(null)).toBe("null");
    });
});

describe("errorCode", () => {
    it("returns the ShamelaError's code verbatim", () => {
        expect(errorCode(new ShamelaError("BAD_ARG", "x"))).toBe("BAD_ARG");
        expect(errorCode(new ShamelaError("OPTION_CONFLICT", "x"))).toBe("OPTION_CONFLICT");
    });

    it("returns SHAMELA_NOT_FOUND for ShamelaNotFoundError", () => {
        const err = new ShamelaNotFoundError([
            { path: "C:\\shamela4", source: "common", reason: "missing" },
        ]);
        expect(errorCode(err)).toBe("SHAMELA_NOT_FOUND");
    });

    it("maps HelperError codes to ErrorCode values", () => {
        expect(errorCode(new HelperError("HELPER_TIMEOUT", "x"))).toBe("HELPER_TIMEOUT");
        expect(errorCode(new HelperError("HELPER_DEAD", "x"))).toBe("HELPER_DIED");
        expect(errorCode(new HelperError("HELPER_DIED", "x"))).toBe("HELPER_DIED");
        expect(errorCode(new HelperError("HELPER_ERROR", "x"))).toBe("INTERNAL");
        expect(errorCode(new HelperError("HELPER_WRITE_ERROR", "x"))).toBe("INTERNAL");
        expect(errorCode(new HelperError("UNKNOWN", "x"))).toBe("INTERNAL");
    });

    it("returns INTERNAL for unknown errors", () => {
        expect(errorCode(new Error("plain"))).toBe("INTERNAL");
        expect(errorCode("string")).toBe("INTERNAL");
        expect(errorCode(null)).toBe("INTERNAL");
    });
});
