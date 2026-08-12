/**
 * Explaining an install the extension cannot run on.
 *
 * The reported case: Shamela's own search engine comes in generations, and this
 * extension uses the engine that ships with the app rather than carrying its
 * own. On an older install the bundled Java refuses to load our helper and the
 * process exits with a bare code 1, which surfaced as "the helper died" — a
 * message that sends people looking for a fault in the extension when the fix
 * is to update the Shamela app.
 *
 * Runs on synthetic install trees; no Shamela needed.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { engineTooOld, indexNotReady, ShamelaError } from "../../src/server/errors.js";
import { resolveEngineGeneration } from "../../src/server/paths.js";

let root: string;

/** The jars a real current engine folder carries — the marker that is read. */
const V2_JARS = ["lucene-core-10.4.0.jar", "AlKhalil-Analyzer-2.1.jar", "shamela-misc-1.0.0.jar"];

/** An older engine: Lucene, but none of the current generation's jars. */
const V1_JARS = ["lucene-core-4.10.4.jar", "AlKhalil-Analyzer-1.0.jar"];

/** Build one engine folder with the jars actually inside it. */
function makeEngine(folder: string, jars: string[]): void {
    const dir = path.join(root, "app", "lucene", folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const jar of jars) fs.writeFileSync(path.join(dir, jar), "x");
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "shamela-engine-"));
});

afterEach(() => {
    try {
        fs.rmSync(root, { recursive: true, force: true });
    } catch {
        /* best-effort */
    }
});

describe("engine generation", () => {
    it("reports generation 2 for a current install", () => {
        makeEngine("2", V2_JARS);
        expect(resolveEngineGeneration(root)).toBe("2");
    });

    it("reports generation 1 for an older install", () => {
        makeEngine("1", V1_JARS);
        expect(resolveEngineGeneration(root)).toBe("1");
    });

    it("prefers the current generation when both are present", () => {
        makeEngine("1", V1_JARS);
        makeEngine("2", V2_JARS);
        expect(resolveEngineGeneration(root)).toBe("2");
    });

    it("says unknown rather than guessing when neither is there", () => {
        expect(resolveEngineGeneration(root)).toBe("unknown");
    });

    // The workaround people actually try. Reading the folder name alone, this
    // install passed the preflight and then died inside Java on a class-version
    // error that named nothing the reader could act on. Reading the jars, it is
    // recognised for what it is and gets the message it needed: update Shamela.
    it("sees an old engine copied into a folder named 2", () => {
        makeEngine("2", V1_JARS);
        expect(resolveEngineGeneration(root)).toBe("1");
    });

    it("is not fooled by a folder named 1 that holds the current engine", () => {
        makeEngine("1", V2_JARS);
        expect(resolveEngineGeneration(root)).toBe("2");
    });

    it("treats a Lucene folder with no jars at all as the older generation", () => {
        // Present but empty is still not the current engine, and calling it
        // "unknown" would send the reader to the "no Shamela found" message
        // instead of the one about updating it.
        makeEngine("2", []);
        expect(resolveEngineGeneration(root)).toBe("1");
    });
});

describe("the errors a stalled start produces", () => {
    it("names the Shamela app, not the extension, when the engine is too old", () => {
        const err = engineTooOld("D:/shamela4");
        expect(err).toBeInstanceOf(ShamelaError);
        expect(err.code).toBe("ENGINE_TOO_OLD");
        // The whole point is that the user knows what to do next.
        expect(err.message).toContain("حدِّث برنامج المكتبة الشاملة");
        expect(err.message).toContain("D:/shamela4");
    });

    it("carries the engine's own explanation when indexes will not open", () => {
        const err = indexNotReady("IOException: Lock held by another program");
        expect(err.code).toBe("INDEX_NOT_READY");
        expect(err.message).toContain("Lock held by another program");
    });
});

describe("readiness timeout is adjustable", () => {
    // The first-call timeouts all came from slower machines, so the wait had to
    // stop being a constant. Exercised through the module's own env handling.
    const original = process.env.SHAMELA_READY_TIMEOUT_MS;

    afterEach(() => {
        if (original === undefined) delete process.env.SHAMELA_READY_TIMEOUT_MS;
        else process.env.SHAMELA_READY_TIMEOUT_MS = original;
    });

    it.each([
        ["45000", 45_000],
        ["", 20_000],
        ["nonsense", 20_000],
        ["10", 20_000], // below the floor: a value this small can only misfire
        ["9999999", 300_000], // capped
    ])("SHAMELA_READY_TIMEOUT_MS=%j resolves to %i ms", async (raw, expected) => {
        if (raw === "") delete process.env.SHAMELA_READY_TIMEOUT_MS;
        else process.env.SHAMELA_READY_TIMEOUT_MS = raw as string;
        const { readyTimeoutMs } = await import("../../src/server/index.js");
        expect(readyTimeoutMs()).toBe(expected);
    });
});
