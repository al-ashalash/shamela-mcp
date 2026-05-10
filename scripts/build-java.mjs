#!/usr/bin/env node
/**
 * Cross-platform Java helper build (replaces build-java.ps1).
 *
 * Compiles src/java/**.java against the user's Shamela install Lucene jars
 * (no third-party deps in the output jar — Lucene + AlKhalil come from the
 * user's install at runtime). Produces helper/shamela-helper.jar.
 *
 * Requires JDK 21+ (javac + jar). Searches PATH, JAVA_HOME, then platform
 * defaults: Eclipse Adoptium / Microsoft / Oracle / Corretto on Windows,
 * `/usr/libexec/java_home -v 21` on macOS, `/usr/lib/jvm/*` on Linux.
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
const isMac = os.platform() === "darwin";
const exeSuffix = isWin ? ".exe" : "";

function which(cmd) {
    const r = spawnSync(isWin ? "where.exe" : "which", [cmd], { encoding: "utf8", shell: false });
    if (r.status !== 0) return null;
    return r.stdout.split(/\r?\n/).find((l) => l.trim().length > 0) ?? null;
}

function findJdkBin() {
    if (which(`javac${exeSuffix}`)) return null; // already on PATH
    if (process.env.JAVA_HOME) {
        const candidate = path.join(process.env.JAVA_HOME, "bin", `javac${exeSuffix}`);
        if (fs.existsSync(candidate)) return path.dirname(candidate);
    }
    if (isMac) {
        const r = spawnSync("/usr/libexec/java_home", ["-v", "21"], { encoding: "utf8" });
        if (r.status === 0) {
            const home = r.stdout.trim();
            if (home && fs.existsSync(path.join(home, "bin", "javac"))) {
                return path.join(home, "bin");
            }
        }
    }
    let bases = [];
    if (isWin) {
        bases = [
            "C:\\Program Files\\Eclipse Adoptium",
            "C:\\Program Files\\Microsoft",
            "C:\\Program Files\\Java",
            "C:\\Program Files\\Amazon Corretto",
        ];
    } else {
        bases = ["/usr/lib/jvm", "/opt/java"];
    }
    for (const base of bases) {
        if (!fs.existsSync(base)) continue;
        for (const entry of fs.readdirSync(base)) {
            const candidate = path.join(base, entry, "bin", `javac${exeSuffix}`);
            if (fs.existsSync(candidate)) return path.dirname(candidate);
        }
    }
    throw new Error(
        "javac not found. Install JDK 21+ (e.g. `winget install EclipseAdoptium.Temurin.21.JDK` " +
            "on Windows, `brew install --cask temurin@21` on macOS) or set JAVA_HOME.",
    );
}

function findShamelaInstall() {
    if (process.env.SHAMELA_INSTALL_ROOT) {
        const r = process.env.SHAMELA_INSTALL_ROOT;
        if (
            fs.existsSync(path.join(r, "database")) &&
            fs.existsSync(path.join(r, "app"))
        ) {
            return r;
        }
    }
    const home = os.homedir();
    let candidates = [];
    if (isWin) {
        candidates = [
            "C:\\shamela4",
            "C:\\Program Files\\shamela4",
            "C:\\Program Files (x86)\\shamela4",
            process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "shamela4"),
            process.env.USERPROFILE && path.join(process.env.USERPROFILE, "shamela4"),
            process.env.USERPROFILE && path.join(process.env.USERPROFILE, "Desktop", "shamela4"),
            "D:\\shamela4",
            "E:\\shamela4",
            "F:\\shamela4",
        ].filter(Boolean);
    } else if (isMac) {
        candidates = [
            path.join(home, "Library", "Application Support", "shamela4"),
            "/Applications/shamela4",
            path.join(home, "shamela4"),
        ];
    } else {
        candidates = [
            path.join(home, ".local", "share", "shamela4"),
            "/opt/shamela4",
            path.join(home, "shamela4"),
        ];
    }
    for (const c of candidates) {
        if (c && fs.existsSync(path.join(c, "app", "lucene", "2"))) return c;
    }
    throw new Error(
        "Could not locate Shamela install (need <root>/app/lucene/2). " +
            "Set SHAMELA_INSTALL_ROOT.",
    );
}

function run(cmd, args, opts = {}) {
    // shell:false avoids DEP0190 + path-with-spaces issues. javac/jar are
    // located via PATH (we prepended the JDK bin dir above), so a bare
    // command name resolves correctly without a shell.
    const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status})`);
}

function walk(dir, ext) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full, ext));
        else if (entry.name.endsWith(ext)) out.push(full);
    }
    return out;
}

function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dst, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

// --- Locate JDK + verify javac ---
const jdkBin = findJdkBin();
if (jdkBin) {
    process.env.PATH = `${jdkBin}${path.delimiter}${process.env.PATH ?? ""}`;
    console.log(`Using JDK at ${jdkBin}`);
}
const javacCheck = spawnSync(`javac${exeSuffix}`, ["-version"], {
    encoding: "utf8",
    shell: false,
});
if (javacCheck.status !== 0) {
    throw new Error("javac -version failed even after PATH adjustment.");
}
console.log(`javac: ${(javacCheck.stdout || javacCheck.stderr).trim()}`);

// --- Locate Shamela + classpath ---
const shamelaRoot = findShamelaInstall();
const luceneDir = path.join(shamelaRoot, "app", "lucene", "2");
console.log(`Shamela: ${shamelaRoot}`);

const cpJars = fs
    .readdirSync(luceneDir)
    .filter((f) => f.endsWith(".jar"))
    .map((f) => path.join(luceneDir, f));
const classpath = cpJars.join(path.delimiter);

// --- Sources ---
const srcRoot = path.join(repoRoot, "src", "java", "src", "main", "java");
const javaFiles = walk(srcRoot, ".java");
if (javaFiles.length === 0) throw new Error(`No .java files found under ${srcRoot}`);

// --- Output dirs ---
const buildDir = path.join(repoRoot, "src", "java", "build");
const classesDir = path.join(buildDir, "classes");
const mergedDir = path.join(buildDir, "merged");
const helperOut = path.join(repoRoot, "helper");
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(classesDir, { recursive: true });
fs.mkdirSync(mergedDir, { recursive: true });
fs.mkdirSync(helperOut, { recursive: true });

// --- Compile ---
console.log(`Compiling ${javaFiles.length} Java sources...`);
run(`javac${exeSuffix}`, [
    "-encoding",
    "UTF-8",
    "-source",
    "21",
    "-target",
    "21",
    "-d",
    classesDir,
    "-cp",
    classpath,
    ...javaFiles,
]);

// --- Bundle classes (no third-party jars; Lucene comes from runtime install) ---
copyDir(classesDir, mergedDir);

const manifestPath = path.join(buildDir, "MANIFEST.MF");
fs.writeFileSync(
    manifestPath,
    [
        "Manifest-Version: 1.0",
        "Main-Class: ws.shamela.mcp.Main",
        "Implementation-Title: shamela-mcp helper",
        "Implementation-Version: 0.0.1",
        "",
    ].join("\n"),
    { encoding: "ascii" },
);

const outJar = path.join(helperOut, "shamela-helper.jar");
const cwd = process.cwd();
process.chdir(mergedDir);
try {
    run(`jar${exeSuffix}`, ["cfm", outJar, manifestPath, "."]);
} finally {
    process.chdir(cwd);
}

const size = fs.statSync(outJar).size;
console.log(
    `Built ${outJar} (${size.toLocaleString()} bytes, ${(size / 1024 / 1024).toFixed(2)} MB)`,
);
