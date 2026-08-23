/**
 * The 2.0.0 field test, first call: every tool refused.
 *
 * The SDK stamps each advertised schema `$schema: draft-07`, and the client
 * validated with a 2020-12-only validator — so all thirty-two tools failed
 * before one of them ran. The suite was green throughout, because the SDK's
 * own test client never validates the dialect. That gap is precisely what
 * this file closes: it asserts on the WIRE, through a real client, that no
 * dialect declaration goes out.
 *
 * The pure half pins the scrubber's one subtle rule — keys are declarations
 * and die; values are content and live.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, it, expect } from "vitest";

import { createServer } from "../../src/server/index.js";
import { stripSchemaDialect } from "../../src/server/schemaCompat.js";

const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

describe("stripSchemaDialect", () => {
    it("removes the declaration at any depth", () => {
        const doc = {
            $schema: DRAFT_07,
            tools: [
                { inputSchema: { $schema: DRAFT_07, type: "object" } },
                { outputSchema: { $schema: DRAFT_07, properties: { x: { $schema: DRAFT_07 } } } },
            ],
        };
        stripSchemaDialect(doc);
        expect(JSON.stringify(doc)).not.toContain(DRAFT_07);
        // Only the stamp is gone; the schema itself is intact.
        expect((doc.tools[0]!.inputSchema as { type?: string }).type).toBe("object");
    });

    it("leaves a different dialect's declaration alone", () => {
        const doc = { $schema: "https://json-schema.org/draft/2020-12/schema" };
        stripSchemaDialect(doc);
        expect(doc.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    });

    it("leaves the URL alone when it is content rather than a declaration", () => {
        // A page of text may QUOTE the URL. Values are library content and are
        // never edited; only a key named $schema carrying exactly that value is
        // a declaration.
        const doc = { body: `النص يذكر ${DRAFT_07} عرضًا`, note: { $schema: "something else" } };
        stripSchemaDialect(doc);
        expect(doc.body).toContain(DRAFT_07);
        expect(doc.note.$schema).toBe("something else");
    });
});

describe("what actually goes over the wire", () => {
    it("advertises every tool without a dialect declaration", async () => {
        const server = createServer(async () => {
            throw new Error("listTools must not need a backend");
        });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const client = new Client({ name: "dialect-check", version: "1.0.0" }, { capabilities: {} });
        await client.connect(clientTransport);

        try {
            const { tools } = await client.listTools();
            expect(tools.length).toBe(34);
            // The assertion the field test would have made for us, had it run
            // before release: nothing on the wire declares draft-07.
            expect(JSON.stringify(tools)).not.toContain(DRAFT_07);
            for (const t of tools) {
                expect(t.outputSchema, `${t.name} lost its output schema`).toBeTruthy();
            }
        } finally {
            await client.close();
        }
    });
});
