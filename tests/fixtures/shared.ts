/**
 * Shared fixtures for integration tests.
 *
 * Singleton-cached at module level. Vitest is configured with singleFork:true
 * so all integration test files share these instances and the JVM only starts
 * once per `npm run test:integration` run.
 */

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";

import { Catalog } from "../../src/server/catalog.js";
import { Helper } from "../../src/server/helper.js";
import { PageStore } from "../../src/server/pages.js";
import { resolveAll, type ShamelaPaths } from "../../src/server/paths.js";
import { ServiceStore } from "../../src/server/services.js";
import type { Backend } from "../../src/server/index.js";

const requireFromHere = createRequire(import.meta.url);

let cachedWasm: Uint8Array | null = null;
let cachedPaths: ShamelaPaths | null = null;
let cachedCatalog: Catalog | null = null;
let cachedPageStore: PageStore | null = null;
let cachedServiceStore: ServiceStore | null = null;
let cachedHelper: Helper | null = null;
let cachedBackend: Backend | null = null;

/** Load sql.js wasm binary once (used by Catalog/PageStore/ServiceStore). */
export function getSqlWasm(): Uint8Array {
    if (cachedWasm) return cachedWasm;
    const wasmPath = requireFromHere.resolve("sql.js/dist/sql-wasm.wasm");
    cachedWasm = new Uint8Array(fs.readFileSync(wasmPath));
    return cachedWasm;
}

/** Resolve Shamela paths once. Throws ShamelaNotFoundError if not installed. */
export async function getPaths(): Promise<ShamelaPaths> {
    if (cachedPaths) return cachedPaths;
    cachedPaths = await resolveAll();
    return cachedPaths;
}

/** Load the Catalog (master.db) once and reuse. */
export async function getCatalog(): Promise<Catalog> {
    if (cachedCatalog) return cachedCatalog;
    const paths = await getPaths();
    const wasm = getSqlWasm();
    cachedCatalog = await Catalog.load(path.join(paths.database, "master.db"), wasm);
    return cachedCatalog;
}

/** Get a PageStore once and reuse. */
export async function getPageStore(): Promise<PageStore> {
    if (cachedPageStore) return cachedPageStore;
    const paths = await getPaths();
    cachedPageStore = new PageStore(paths.database, getSqlWasm());
    return cachedPageStore;
}

/** Get a ServiceStore once and reuse. */
export async function getServiceStore(): Promise<ServiceStore> {
    if (cachedServiceStore) return cachedServiceStore;
    const paths = await getPaths();
    cachedServiceStore = new ServiceStore(paths.database, getSqlWasm());
    return cachedServiceStore;
}

/** Boot the Java helper once (5+ second JVM cold-start) and reuse across tests. */
export async function getHelper(): Promise<Helper> {
    if (cachedHelper) return cachedHelper;
    const paths = await getPaths();
    cachedHelper = new Helper({ paths });
    await cachedHelper.ready(30_000);
    return cachedHelper;
}

/** Build a Backend object that the MCP integration test can wire into createServer. */
export async function getBackend(): Promise<Backend> {
    if (cachedBackend) return cachedBackend;
    cachedBackend = {
        helper: await getHelper(),
        catalog: await getCatalog(),
        pages: await getPageStore(),
        services: await getServiceStore(),
    };
    return cachedBackend;
}

// --- Canonical fixture book -------------------------------------------------

/**
 * The smoke test's canonical fixture book.
 *   - id 9942 = الأصول من علم الأصول، ابن عثيمين
 *   - 23 top-level chapters, single-volume, no service annotations
 *   - "الكلام" → 9 page hits (8 body + 1 foot)
 * Tests assume this book is downloaded on the user's machine.
 */
export const FIXTURE_BOOK_ID = 9942;
export const FIXTURE_BOOK_NAME = "الأصول من علم الأصول";
