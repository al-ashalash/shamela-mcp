/**
 * The declared output shapes have to keep matching what the tools return.
 *
 * The protocol renders a declared shape with `additionalProperties: false`, so a
 * field a tool starts returning without being declared does not degrade the
 * response — it makes the call fail outright, in whoever's session hits it
 * first. That is a good contract and a bad way to find out about a mistake, so
 * this suite calls the tools and checks their answers against the schemas here,
 * where a break is cheap.
 *
 * It also guards the other direction: every registered tool must have a
 * declared shape, so a tool added later cannot quietly ship without one.
 */

import { z } from "zod";
import { describe, it, expect, beforeAll } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../../src/server/index.js";
import { OUTPUT_SCHEMAS } from "../../src/server/outputSchemas.js";
import { FIXTURE_BOOK_ID, getBackend } from "../fixtures/shared.js";

let client: Client;

/** Representative calls: enough of the surface that a shape break shows up. */
const CALLS: Array<{ name: string; args: Record<string, unknown> }> = [
    { name: "shamela_health", args: {} },
    { name: "shamela_guide", args: {} },
    { name: "shamela_get_book", args: { book_id: FIXTURE_BOOK_ID } },
    { name: "shamela_get_page", args: { book_id: FIXTURE_BOOK_ID, page_id: 63 } },
    { name: "shamela_get_pages_range", args: { book_id: FIXTURE_BOOK_ID, start_page_id: 10, count: 2 } },
    { name: "shamela_get_toc", args: { book_id: FIXTURE_BOOK_ID } },
    { name: "shamela_get_book_parts", args: { book_id: FIXTURE_BOOK_ID } },
    { name: "shamela_get_page_services", args: { book_id: FIXTURE_BOOK_ID, page_id: 63 } },
    { name: "shamela_get_citation", args: { book_id: FIXTURE_BOOK_ID, page_id: 63 } },
    {
        name: "shamela_search_pages",
        args: { query: "الكلام", scope: { book_ids: [FIXTURE_BOOK_ID] }, limit: 3 },
    },
    {
        name: "shamela_search_phrase",
        args: { query: "الكلام لغة", scope: { book_ids: [FIXTURE_BOOK_ID] }, limit: 3 },
    },
    {
        name: "shamela_search_boolean",
        args: { all_of: ["الكلام"], any_of: ["خبر"], scope: { book_ids: [FIXTURE_BOOK_ID] }, limit: 3 },
    },
    // search_exact and search_hadith were never called here, so a break in
    // their declared shape would have surfaced in a user's session rather than
    // in development — which is the one thing this file exists to prevent.
    {
        name: "shamela_search_exact",
        args: {
            query: "الكلام",
            preserve: { preserve_hamza: true },
            scope: { book_ids: [FIXTURE_BOOK_ID] },
            limit: 3,
        },
    },
    { name: "shamela_search_hadith", args: { query: "الكلام", max_pages_scanned: 2, limit: 2 } },
    // A search that finds nothing carries `suggestions`, which no other call
    // here exercises.
    {
        name: "shamela_search_pages",
        args: { query: "زقنطوريةٌ", scope: { book_ids: [FIXTURE_BOOK_ID] }, limit: 3 },
    },
    { name: "shamela_search_books", args: { query: "زقنطوريةٌ", limit: 3 } },
    { name: "shamela_root_stats", args: { root: "كلم", scope: { book_ids: [FIXTURE_BOOK_ID] } } },
    { name: "shamela_search_titles", args: { query: "تعريف", limit: 3 } },
    { name: "shamela_search_books", args: { query: "علم", limit: 3 } },
    { name: "shamela_search_authors", args: { query: "ابن", limit: 3 } },
    { name: "shamela_search_quran", args: { query: "الصبر", limit: 3 } },
    { name: "shamela_get_aya", args: { aya_id: 1 } },
    { name: "shamela_list_categories", args: {} },
    { name: "shamela_list_downloaded_books", args: { limit: 3 } },
    { name: "shamela_resolve", args: { query: "ابن قدامة", type: "author" } },
    { name: "shamela_books_by_period", args: { composed_from: 600, composed_to: 700, limit: 3 } },
    { name: "shamela_suggest_download", args: { query: "المغني", limit: 3 } },
    // suggest_download has three entry paths and only the `query` one was ever
    // called here, so the other two shipped broken: with no query the tool emits
    // `query: null`, the declared shape said `z.string()`, and the protocol
    // rejected the whole response. The tool's own description advertises
    // `{book_ids:[6658]}` as an example, so the documented call was the failing
    // one. Both paths are exercised from now on.
    { name: "shamela_suggest_download", args: { book_ids: [6658] } },
    { name: "shamela_suggest_download", args: { category_id: 26, limit: 3 } },
];

beforeAll(async () => {
    const backend = await getBackend();
    const server = createServer(async () => backend);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "output-schema-test", version: "1.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
}, 120_000);

describe("declared output shapes", () => {
    it("every registered tool declares one", async () => {
        const listed = await client.listTools();
        const missing = listed.tools.map((t) => t.name).filter((n) => !(n in OUTPUT_SCHEMAS));
        expect(missing, `tools with no declared output shape: ${missing.join(", ")}`).toEqual([]);
    });

    it("no shape is declared for a tool that does not exist", async () => {
        const listed = new Set((await client.listTools()).tools.map((t) => t.name));
        const orphans = Object.keys(OUTPUT_SCHEMAS).filter((n) => !listed.has(n));
        expect(orphans, `declared shapes with no tool: ${orphans.join(", ")}`).toEqual([]);
    });

    it.each(CALLS.map((c) => [c.name, c.args] as const))(
        "%s returns a response its declared shape accepts",
        async (name, args) => {
            const result = (await client.callTool({ name, arguments: args })) as {
                isError?: boolean;
                structuredContent?: Record<string, unknown>;
            };
            // Reaching here at all means the protocol already validated it; the
            // explicit parse states what is being relied on.
            expect(result.isError, `${name} returned an error`).toBeFalsy();
            expect(result.structuredContent, `${name} returned no structured content`).toBeDefined();
            const shape = OUTPUT_SCHEMAS[name as keyof typeof OUTPUT_SCHEMAS];
            const parsed = z.object(shape as never).safeParse(result.structuredContent);
            expect(parsed.success, `${name}: ${JSON.stringify(parsed.error?.issues ?? [])}`).toBe(true);
        },
        60_000,
    );
});
