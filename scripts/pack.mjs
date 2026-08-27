#!/usr/bin/env node
/**
 * Cross-platform pack script (replaces pack.ps1).
 *
 * Pipeline: build:server (esbuild) -> build:java (cross-platform helper jar) ->
 * mcpb pack. Produces shamela-mcp-<version>.mcpb at the repo root, where
 * <version> comes from manifest.json.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
process.chdir(repoRoot);

const isWin = os.platform() === "win32";

const manifestPath = path.join(repoRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = manifest.version;
if (!version) throw new Error("manifest.json has no version field");

console.log(`Building shamela-mcp v${version}...`);

// On Windows, npm/npx/mcpb are .cmd shims — Node 24 refuses to spawn .cmd
// without shell:true (CVE-2024-27980 mitigation). Use shell only for those
// known shims; spawn other commands (node by absolute path) without shell so
// we don't trip on spaces in `C:\Program Files\nodejs\node.exe`.
const SHIMS = new Set(["npm", "npx", "mcpb"]);
function run(cmd, args, opts = {}) {
    const useShell = isWin && SHIMS.has(cmd);
    const r = spawnSync(cmd, args, { stdio: "inherit", shell: useShell, ...opts });
    if (r.status !== 0) {
        throw new Error(
            `${cmd} ${args.join(" ")} failed (exit ${r.status}, signal ${r.signal})`,
        );
    }
}

/**
 * The helper jar is a build output kept out of git, and on a machine without a
 * JDK the build step above can be skipped or fail soft — leaving a jar older
 * than the Java sources. That ships a release whose Java-side fix simply is not
 * in it, and nothing downstream would notice: the tests exercise the jar, so
 * they would pass against the stale one and report green.
 */
function assertJarIsCurrent() {
    const jar = path.join(repoRoot, "helper", "shamela-helper.jar");
    if (!fs.existsSync(jar)) {
        throw new Error(`helper/shamela-helper.jar is missing — build it before packing`);
    }
    const jarTime = fs.statSync(jar).mtimeMs;

    const javaRoot = path.join(repoRoot, "src", "java");
    let newest = 0;
    let newestFile = "";
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.name.endsWith(".java")) {
                const t = fs.statSync(full).mtimeMs;
                if (t > newest) {
                    newest = t;
                    newestFile = path.relative(repoRoot, full);
                }
            }
        }
    };
    if (fs.existsSync(javaRoot)) walk(javaRoot);

    if (newest > jarTime) {
        throw new Error(
            `helper/shamela-helper.jar is older than ${newestFile}\n` +
                `  jar:    ${new Date(jarTime).toISOString()}\n` +
                `  source: ${new Date(newest).toISOString()}\n` +
                `Rebuild it (npm run build:java) before packing — packing now would ` +
                `ship a bundle without the Java changes.`,
        );
    }
    console.log(`  jar is current (built ${new Date(jarTime).toISOString()})`);
}

console.log("[1/3] Building Node server...");
run("npm", ["run", "build:server"]);

console.log("[2/3] Building Java helper...");
run(process.execPath, [path.join(__dirname, "build-java.mjs")]);
assertJarIsCurrent();

console.log("[3/3] Packing .mcpb...");
const outFile = path.join(repoRoot, `shamela-mcp-${version}.mcpb`);
// Remove any prior bundle so size/output reflects the new build.
fs.rmSync(outFile, { force: true });

// Try `mcpb` on PATH first; fall back to `npx --yes @anthropic-ai/mcpb`.
const mcpbDirect = spawnSync(isWin ? "where" : "which", ["mcpb"], { encoding: "utf8" });
const onPath = mcpbDirect.status === 0;
if (onPath) {
    run("mcpb", ["pack", repoRoot, outFile]);
} else {
    console.log("  mcpb not on PATH; using npx...");
    run("npx", ["--yes", "@anthropic-ai/mcpb", "pack", repoRoot, outFile]);
}

if (!fs.existsSync(outFile)) {
    throw new Error(`Pack reported success but ${outFile} is missing`);
}
const size = fs.statSync(outFile).size;
console.log(`Produced ${outFile} (${(size / 1024 / 1024).toFixed(2)} MB)`);
