import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

/**
 * Stub `.wasm` imports so vitest doesn't choke on
 * `import sqlWasm from "sql.js/dist/sql-wasm.wasm"` in src/server/index.ts.
 * Production esbuild bundles the wasm via `--loader:.wasm=binary`; tests
 * never touch this stub — they load the real wasm via fs.readFileSync in
 * tests/fixtures/shared.ts.
 */
const wasmStubPlugin: Plugin = {
    name: "wasm-stub",
    enforce: "pre",
    resolveId(id) {
        if (id.endsWith(".wasm")) return "\0wasm-stub";
        return null;
    },
    load(id) {
        if (id === "\0wasm-stub") return "export default new Uint8Array(0);";
        return null;
    },
};

export default defineConfig({
    plugins: [wasmStubPlugin],
    test: {
        globals: false,
        environment: "node",
        include: ["tests/**/*.test.ts"],
        exclude: ["tests/smoke.ts", "tests/benchmark.ts", "node_modules", "dist"],
        // Lucene queries can be slow on first run; the JVM cold-start is in beforeAll.
        testTimeout: 30_000,
        hookTimeout: 60_000,
        // Share module state across test files so fixtures/shared.ts can cache
        // the JVM helper, catalog, and sql.js wasm. Without this, every
        // integration test file would pay a 3-5s JVM cold-start.
        isolate: false,
        fileParallelism: false,
        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            include: ["src/server/**/*.ts"],
            exclude: ["src/server/index.ts"],
        },
    },
});
