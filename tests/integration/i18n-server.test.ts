/**
 * The catalogue being complete is not the same as the server using it.
 *
 * This drives the real protocol surface — listTools, listResources, the server's
 * own instructions — with the language set, and checks that what a client would
 * actually see changed. It is the guard against the failure that unit tests
 * cannot see: a translation that exists and is never read.
 *
 * The backend is never touched: `createServer` registers everything eagerly and
 * only awaits the backend inside a handler, so no Shamela install or JVM is
 * needed to inspect what was registered.
 */
import { describe, it, expect, afterEach } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer, type Backend } from "../../src/server/index.js";
import { ar } from "../../src/server/i18n/ar.js";
import { en } from "../../src/server/i18n/en.js";
import { resetLangForTesting, SUPPORTED_LANGS } from "../../src/server/i18n/index.js";
import { buildGuideText, resolveGuideSection } from "../../src/server/guide.js";

/** A backend nobody is allowed to reach: registration must not need one. */
const unusedBackend = async (): Promise<Backend> => {
    throw new Error("the backend must not be touched while registering tools");
};

async function connectWithLang(lang: string | undefined) {
    if (lang === undefined) delete process.env.SHAMELA_LANG;
    else process.env.SHAMELA_LANG = lang;
    resetLangForTesting();

    const server = createServer(unusedBackend);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "i18n-test", version: "1.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return client;
}

describe("the server speaks the configured language", () => {
    afterEach(() => {
        delete process.env.SHAMELA_LANG;
        resetLangForTesting();
    });

    it("titles every tool in Arabic by default", async () => {
        const client = await connectWithLang(undefined);
        const { tools } = await client.listTools();
        expect(tools.length).toBeGreaterThan(0);
        for (const t of tools) {
            const expected = ar.toolTitles[t.name as keyof typeof ar.toolTitles];
            expect(expected, `no Arabic title for ${t.name}`).toBeDefined();
            expect(t.title, `title of ${t.name}`).toBe(expected);
        }
    });

    it("titles every tool in English when asked", async () => {
        const client = await connectWithLang("en");
        const { tools } = await client.listTools();
        for (const t of tools) {
            const expected = en.toolTitles[t.name as keyof typeof en.toolTitles];
            expect(expected, `no English title for ${t.name}`).toBeDefined();
            expect(t.title, `title of ${t.name}`).toBe(expected);
            expect(/[؀-ۿ]/.test(t.title ?? ""), `${t.name} title still Arabic`).toBe(false);
        }
    });

    it("every registered tool has a title in the catalogue — no tool ships untitled", async () => {
        // The guard that catches a tool added without a translation: the
        // catalogue is typed, but a NEW tool name is new in both places at once,
        // so only the live registry can prove they agree.
        const client = await connectWithLang(undefined);
        const { tools } = await client.listTools();
        const catalogued = Object.keys(ar.toolTitles).sort();
        expect(tools.map((t) => t.name).sort()).toEqual(catalogued);
    });

    it("describes its resources in the configured language", async () => {
        const client = await connectWithLang("en");
        const { resources } = await client.listResources();
        expect(resources.length).toBeGreaterThan(0);
        for (const r of resources) {
            expect(/[؀-ۿ]/.test(r.name ?? ""), `resource ${r.uri} name still Arabic`).toBe(false);
        }
    });

    it("hands the model its instructions in the configured language", async () => {
        const arabicClient = await connectWithLang(undefined);
        expect(arabicClient.getInstructions()).toBe(ar.instructions);

        const englishClient = await connectWithLang("en");
        const instructions = englishClient.getInstructions() ?? "";
        expect(instructions).toBe(en.instructions);
        expect(/[؀-ۿ]/.test(instructions)).toBe(false);
        // The instructions are the honesty rules; a translation that dropped one
        // would ship a model that attributes text it never read.
        expect(instructions).toContain("shamela_get_citation");
        expect(instructions).toContain("footnote");
    });

    it("the guide names every registered tool, in every language", async () => {
        // The drift guard that matters most for a translated guide: a tool
        // added to the server and forgotten in one translation leaves that
        // language's users unable to discover it, and nothing else would say so.
        for (const lang of SUPPORTED_LANGS) {
            const client = await connectWithLang(lang);
            const { tools } = await client.listTools();
            resetLangForTesting();
            process.env.SHAMELA_LANG = lang;
            const guide = buildGuideText();
            for (const t of tools) {
                expect(guide, `${lang} guide does not name ${t.name}`).toContain(t.name);
            }
        }
    });

    it("a guide section can be asked for in either language", async () => {
        for (const [asked, expected] of [
            ["الأدوات", "الأدوات"],
            ["tools", "الأدوات"],
            ["TIPS", "النصائح"],
            ["all", "الكل"],
            ["الكل", "الكل"],
        ] as const) {
            expect(resolveGuideSection(asked), `resolveGuideSection(${asked})`).toBe(expected);
        }
        // And something that means nothing still means nothing.
        expect(resolveGuideSection("قوالب")).toBeNull();
        expect(resolveGuideSection("templates")).toBeNull();
    });

    it("an unknown language setting still yields a working Arabic server", async () => {
        const client = await connectWithLang("klingon");
        const { tools } = await client.listTools();
        expect(tools.length).toBeGreaterThan(0);
        expect(tools[0]!.title).toBe(ar.toolTitles[tools[0]!.name as keyof typeof ar.toolTitles]);
    });
});
