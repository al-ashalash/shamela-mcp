/**
 * The wire contract of every tool, frozen.
 *
 * A tool's input and output schemas are the part of this extension that other
 * software depends on. Renaming a parameter, making an optional one required,
 * changing a field's type, or dropping a declared output field breaks callers
 * we cannot see — and each of those is a one-line edit that looks harmless in
 * review, compiles, and passes every other test in the suite.
 *
 * So the schemas are recorded, and a change to any of them fails here. The test
 * does not judge whether the change is right: it asks whether it was meant.
 * When it was, regenerate the file and let the diff be read in review, which is
 * the only place a contract change should ever be noticed.
 *
 *     UPDATE_TOOL_SNAPSHOTS=1 npx vitest run tests/unit/tool-schema-snapshots.test.ts
 *
 * What is recorded is what the PROTOCOL advertises, not what the zod source
 * says — the two can drift, and callers only ever see the first. Descriptions
 * come along with it because they are inside the schemas; they are English by
 * convention in this repo and do not move with SHAMELA_LANG, so the snapshot
 * stays deterministic. Tool titles are deliberately NOT recorded: those are
 * translated, and a snapshot that changed with the reader's language would fail
 * for the wrong reason.
 *
 * Registration never touches the backend, so this runs as a unit test — no
 * JVM, no SQLite, no Shamela install. That is what lets it guard the contract
 * in CI, where none of those exist.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { createServer, type Backend } from "../../src/server/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.resolve(HERE, "../snapshots/tool-schemas.json");

/** Sorted keys throughout, so a reordering in the source is not a diff. */
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(value as Record<string, unknown>).sort()) {
            out[k] = canonical((value as Record<string, unknown>)[k]);
        }
        return out;
    }
    return value;
}

type Recorded = Record<string, { inputSchema: unknown; outputSchema: unknown }>;

describe("tool schemas are the contract", () => {
    let client: Client;
    let current: Recorded;

    beforeAll(async () => {
        // A backend that would throw if anything reached for it. Registration
        // is lazy, so nothing does — and if that ever stops being true, this
        // test says so instead of quietly booting a JVM in CI.
        const server = createServer(async () => {
            throw new Error("listTools must not need a backend");
        });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        client = new Client({ name: "schema-snapshot", version: "1.0.0" }, { capabilities: {} });
        await client.connect(clientTransport);

        const { tools } = await client.listTools();
        current = {};
        for (const t of tools.sort((a, b) => a.name.localeCompare(b.name))) {
            current[t.name] = {
                inputSchema: canonical(t.inputSchema),
                outputSchema: canonical(t.outputSchema ?? null),
            };
        }
    });

    afterAll(async () => {
        await client.close();
    });

    it("match the recorded snapshot", () => {
        const serialised = JSON.stringify(current, null, 2) + "\n";

        if (process.env.UPDATE_TOOL_SNAPSHOTS === "1") {
            fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
            fs.writeFileSync(SNAPSHOT, serialised, "utf8");
        }

        expect(
            fs.existsSync(SNAPSHOT),
            `no snapshot yet — record one with:\n  UPDATE_TOOL_SNAPSHOTS=1 npx vitest run ${path.relative(process.cwd(), __filename ?? "")}`,
        ).toBe(true);

        const recorded = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) as Recorded;

        // Named first, so an added or removed tool reads as that rather than as
        // a wall of schema diff.
        expect(Object.keys(current), "the set of tools changed").toEqual(Object.keys(recorded));

        for (const name of Object.keys(recorded)) {
            expect(
                current[name],
                `${name}: its schema changed. If that was intended, regenerate with UPDATE_TOOL_SNAPSHOTS=1 and let the diff be reviewed.`,
            ).toEqual(recorded[name]);
        }
    });

    it("every tool declares both an input and an output schema", () => {
        // An output schema is what makes structuredContent checkable at the
        // protocol layer; a tool without one returns whatever it likes.
        for (const [name, s] of Object.entries(current)) {
            expect(s.inputSchema, `${name} has no input schema`).toBeTruthy();
            expect(s.outputSchema, `${name} has no output schema`).toBeTruthy();
        }
    });
});
