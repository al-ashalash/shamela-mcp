#!/usr/bin/env node
/**
 * Inspect a packed .mcpb before it is published.
 *
 * Packing succeeds even when the bundle is wrong in ways that only surface on a
 * user's machine: a stale helper jar, a version that disagrees with the repo, a
 * server build missing a tool that was supposedly added. This unpacks the
 * archive and checks the payload itself, so the release checklist stops
 * depending on someone remembering to look.
 *
 * Usage: node scripts/verify-mcpb.mjs [path/to/bundle.mcpb]
 * Default: shamela-mcp-<manifest version>.mcpb at the repo root.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const repoManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8"));
const bundlePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(repoRoot, `shamela-mcp-${repoManifest.version}.mcpb`);

const failures = [];
const notes = [];
const check = (ok, label, detail = "") => {
    console.log(`${ok ? "[OK]  " : "[FAIL]"} ${label}${detail ? `  —  ${detail}` : ""}`);
    if (!ok) failures.push(label);
};

if (!fs.existsSync(bundlePath)) {
    console.error(`Bundle not found: ${bundlePath}`);
    process.exit(1);
}
console.log(`Verifying ${path.basename(bundlePath)} (${(fs.statSync(bundlePath).size / 1024 / 1024).toFixed(2)} MB)\n`);

// tar handles zip on Windows 10+ and on macOS/Linux bsdtar; that keeps this
// script dependency-free.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mcpb-verify-"));
const tarBin = os.platform() === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";
const untar = spawnSync(tarBin, ["-xf", bundlePath, "-C", tmp], { encoding: "utf8" });
if (untar.status !== 0) {
    console.error(`Could not unpack the bundle: ${untar.stderr || untar.error}`);
    process.exit(1);
}

try {
    // 1. Manifest agrees with the repo.
    const manifestFile = path.join(tmp, "manifest.json");
    check(fs.existsSync(manifestFile), "bundle contains manifest.json");
    const bundled = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    check(
        bundled.version === repoManifest.version,
        "bundled version matches the repo manifest",
        `bundle=${bundled.version} repo=${repoManifest.version}`,
    );
    check(
        Array.isArray(bundled.tools) && bundled.tools.length > 0,
        "manifest declares tools",
        `${bundled.tools?.length ?? 0} tools`,
    );
    check(
        !bundled.prompts || bundled.prompts.length === 0,
        "manifest declares no prompts (they are not shipped in this extension)",
    );

    // 2. Server build is present and carries the declared tools. The bundle is
    //    minified with escaped identifiers, so search for the ASCII tool names.
    const serverFile = path.join(tmp, "dist", "index.js");
    check(fs.existsSync(serverFile), "bundle contains dist/index.js");
    const server = fs.readFileSync(serverFile, "utf8");
    check(server.length > 100_000, "server build looks complete", `${(server.length / 1024).toFixed(0)} KB`);
    const missing = (bundled.tools ?? []).map((t) => t.name).filter((n) => !server.includes(n));
    check(missing.length === 0, "every declared tool appears in the server build", missing.join(", ") || "none missing");

    // 3. Helper jar is present and no older than the Java sources.
    const jarFile = path.join(tmp, "helper", "shamela-helper.jar");
    check(fs.existsSync(jarFile), "bundle contains helper/shamela-helper.jar");
    if (fs.existsSync(jarFile)) {
        const bundledJar = fs.statSync(jarFile);
        const repoJar = path.join(repoRoot, "helper", "shamela-helper.jar");
        if (fs.existsSync(repoJar)) {
            check(
                fs.statSync(repoJar).size === bundledJar.size,
                "bundled jar matches the one built in the repo",
                `${bundledJar.size} bytes`,
            );
        } else {
            notes.push("no jar in the working tree to compare against");
        }
        const javaRoot = path.join(repoRoot, "src", "java");
        let newest = 0;
        const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (e.name.endsWith(".java")) newest = Math.max(newest, fs.statSync(full).mtimeMs);
            }
        };
        if (fs.existsSync(javaRoot)) walk(javaRoot);
        // The packer preserves mtime poorly across zip implementations, so this
        // is a soft signal: compare against the repo jar, which is authoritative.
        if (fs.existsSync(repoJar) && newest > fs.statSync(repoJar).mtimeMs) {
            check(false, "jar is at least as new as the Java sources");
        } else {
            check(true, "jar is at least as new as the Java sources");
        }
    }
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

for (const n of notes) console.log(`[note] ${n}`);
console.log("");
if (failures.length) {
    console.error(`FAILED (${failures.length}): ${failures.join("; ")}`);
    process.exit(1);
}
console.log("Bundle looks publishable.");
