/**
 * The other half of the fixture guard.
 *
 * tests/unit/synthetic-library.test.ts reads the expected schema back out of
 * the files the fixture generates, on a machine with no Shamela install. That
 * proves the generator does what it says — and nothing at all about whether
 * what it says is still true of Shamela.
 *
 * This half reads the same constant out of the REAL library. Together they mean
 * a schema change in Shamela fails here, on a maintainer's machine, before the
 * fixture can start telling CI that code works against a shape the real files
 * no longer have. That failure mode is the one thing worse than having no
 * fixture: a green suite testing a library that does not exist.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import initSqlJs from "sql.js";
import { describe, it, expect, beforeAll } from "vitest";

import { EXPECTED_SCHEMA } from "../fixtures/synthetic-library.js";
import { FIXTURE_BOOK_ID, getPaths, getSqlWasm } from "../fixtures/shared.js";

let database: string;

/**
 * Column defaults are dropped before comparing.
 *
 * Shamela builds differ here in ways that mean nothing to the fixture: this
 * library declares `user_excluded INTEGER DEFAULT 0` where the fixture writes
 * `user_excluded INTEGER`. A default governs what an INSERT stores, and nothing
 * in this project inserts — every open is read-only. Comparing it turned a
 * version difference between two correct libraries into a failing test.
 *
 * Table names, column names and column types are still compared exactly, so
 * the drift this guard exists to catch still fails it.
 */
const stripDefaults = (sql: string): string =>
    sql.replace(/\s+DEFAULT\s+(?:'[^']*'|"[^"]*"|[^\s,)]+)/gi, "");

async function tablesOf(file: string): Promise<string[]> {
    const SQL = await initSqlJs({ wasmBinary: getSqlWasm().buffer as ArrayBuffer });
    const db = new SQL.Database(fs.readFileSync(file));
    const res = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name");
    const out = (res[0]?.values ?? []).map((r) => stripDefaults(String(r[0]).replace(/\s+/g, " ")).trim());
    db.close();
    return out;
}

/** The bucket folder Shamela files a book under: the remainder, padded to three. */
const bucketOf = (id: number): string => String(id % 1000).padStart(3, "0");

beforeAll(async () => {
    database = (await getPaths()).database;
}, 60_000);

describe("the real library still has the shape the fixture imitates", () => {
    it("master.db", async () => {
        expect(await tablesOf(path.join(database, "master.db"))).toEqual([...EXPECTED_SCHEMA.master]);
    });

    it("a per-book database", async () => {
        const file = path.join(database, "book", bucketOf(FIXTURE_BOOK_ID), `${FIXTURE_BOOK_ID}.db`);
        expect(fs.existsSync(file), `expected the fixture book at ${file}`).toBe(true);
        expect(await tablesOf(file)).toEqual([...EXPECTED_SCHEMA.book]);
    });

    it("a service database", async () => {
        expect(await tablesOf(path.join(database, "service", "tafseer.db"))).toEqual([
            ...EXPECTED_SCHEMA.service,
        ]);
    });
});
