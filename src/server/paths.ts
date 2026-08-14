/**
 * Resolve all the paths the MCP server needs from a Shamela 4 install:
 * the database folder, the bundled JRE executable, the classpath jars, and
 * our own helper.jar inside the .mcpb.
 *
 * Resolution priority:
 *   1. Env var SHAMELA_INSTALL_ROOT (set by Claude Desktop from the user's
 *      install dialog choice via manifest.json's user_config substitution).
 *   2. Windows registry: HKLM and HKCU Uninstall keys for an app whose
 *      DisplayName contains "Shamela" or "المكتبة الشاملة".
 *   3. A list of common install locations across drives C:..F:.
 *
 * On Windows, never assume C:\shamela4 — users install wherever they like.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { messages } from "./i18n/index.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ShamelaPaths {
    installRoot: string;
    /**
     * How the root was found: the user's explicit setting, the Windows
     * registry, or one of the common locations. Carried so shamela_health can
     * SAY which library it is reading — resolution can recover from a bad
     * explicit setting, and a recovery nobody is told about is how someone
     * with two Shamela copies reads from the one they did not ask for.
     */
    installRootSource: "setting" | "registry" | "auto";
    /**
     * Present when the user's explicit setting was rejected and resolution
     * fell back. The fallback is deliberate — a typo in the settings field
     * should not brick the extension — but it must never be silent: this is
     * the record health turns into a warning the user actually sees.
     */
    rejectedSetting?: { path: string; reason: string };
    database: string;
    jre: string;
    jars: string[];
    helperJar: string;
    /**
     * Which generation of Shamela's bundled search engine this install ships:
     * "2" is the current one, "1" an older build. The helper is compiled
     * against the current generation's Java, so on "1" it cannot even load —
     * knowing this before launching turns a bare exit code into an explanation.
     */
    engineGeneration: "1" | "2" | "unknown";
}

export interface ProbedPath {
    path: string;
    source: "env" | "registry" | "common" | "user_config";
    reason: string;
}

export class ShamelaNotFoundError extends Error {
    code = "SHAMELA_NOT_FOUND";
    probed: ProbedPath[];

    constructor(probed: ProbedPath[]) {
        const lines = probed.map((p) => `  ${p.path}  [${p.source}]  ${p.reason}`).join("\n");
        super(messages().startup.notFound(lines));
        this.probed = probed;
        this.name = "ShamelaNotFoundError";
    }
}

/**
 * Validate a candidate install root: must contain `database/` and `app/` siblings.
 * Accepts either the install root itself or its `database/` child.
 */
export function validateInstallRoot(
    candidate: string,
): { ok: true; installRoot: string } | { ok: false; reason: string } {
    const S = messages().startup.probe;
    if (!candidate) return { ok: false, reason: S.empty };

    let resolved: string;
    try {
        resolved = path.resolve(candidate);
    } catch {
        return { ok: false, reason: S.notAbsolute };
    }

    if (!fs.existsSync(resolved)) return { ok: false, reason: S.missing };
    let stat: fs.Stats;
    try {
        stat = fs.statSync(resolved);
    } catch (err) {
        return { ok: false, reason: S.unreadable((err as Error).message) };
    }
    if (!stat.isDirectory()) return { ok: false, reason: S.notADirectory };

    // If the user pointed at .../database, walk up one.
    const base = path.basename(resolved);
    const candidateRoot = base.toLowerCase() === "database" ? path.dirname(resolved) : resolved;

    const dbDir = path.join(candidateRoot, "database");
    const appDir = path.join(candidateRoot, "app");
    if (!fs.existsSync(dbDir)) return { ok: false, reason: S.noDatabaseDir };
    if (!fs.existsSync(appDir)) return { ok: false, reason: S.noAppDir };
    return { ok: true, installRoot: candidateRoot };
}

/**
 * Probe the Windows Uninstall registry for an entry whose DisplayName contains
 * "Shamela" or "المكتبة الشاملة" and return its InstallLocation.
 *
 * Returns an empty array on non-Windows or on probe failure.
 */
export function probeRegistry(): string[] {
    if (process.platform !== "win32") return [];

    const ps = `
$ErrorActionPreference = 'SilentlyContinue';
$roots = @(
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
);
$out = @();
foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
        $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue;
        if ($null -eq $p) { return }
        $dn = $p.DisplayName;
        if ($null -eq $dn) { return }
        $matchAr = $dn.Contains([char]0x0645 + [char]0x0643 + [char]0x062A + [char]0x0628 + [char]0x0629);
        if ($dn -match 'Shamela' -or $matchAr) {
            $loc = $p.InstallLocation;
            if ($loc) { $out += $loc }
        }
    }
}
$out | ForEach-Object { Write-Output $_ }
`;
    try {
        const stdout = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
            encoding: "utf8",
            timeout: 5000,
            windowsHide: true,
        });
        return stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    } catch {
        return [];
    }
}

/**
 * Common install locations to probe on each platform, with env-var expansion.
 * Order matters: the first match wins.
 */
export function commonLocations(): string[] {
    const home = os.homedir();
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA;
        const userProfile = process.env.USERPROFILE ?? home;
        const list = [
            "C:\\shamela4",
            "C:\\Program Files\\shamela4",
            "C:\\Program Files (x86)\\shamela4",
        ];
        if (localAppData) list.push(path.join(localAppData, "shamela4"));
        list.push(
            path.join(userProfile, "shamela4"),
            path.join(userProfile, "Desktop", "shamela4"),
        );
        for (const drive of ["D", "E", "F"]) {
            list.push(`${drive}:\\shamela4`);
        }
        return list;
    }
    if (process.platform === "darwin") {
        return [path.join(home, "Library", "Application Support", "Shamela")];
    }
    // Linux fallback (untested)
    return [path.join(home, ".local", "share", "Shamela")];
}

function findInstallRoot(): { installRoot: string; probed: ProbedPath[] } {
    const probed: ProbedPath[] = [];

    // 1. Env override
    const envRoot = process.env.SHAMELA_INSTALL_ROOT?.trim();
    if (envRoot) {
        const r = validateInstallRoot(envRoot);
        if (r.ok) return { installRoot: r.installRoot, probed: [{ path: envRoot, source: "env", reason: messages().startup.probe.valid }] };
        probed.push({ path: envRoot, source: "env", reason: r.reason });
    }

    // 2. Registry probe (Windows only)
    if (process.platform === "win32") {
        for (const candidate of probeRegistry()) {
            const r = validateInstallRoot(candidate);
            if (r.ok) {
                probed.push({ path: candidate, source: "registry", reason: messages().startup.probe.valid });
                return { installRoot: r.installRoot, probed };
            }
            probed.push({ path: candidate, source: "registry", reason: r.reason });
        }
    }

    // 3. Common locations
    for (const candidate of commonLocations()) {
        const r = validateInstallRoot(candidate);
        if (r.ok) {
            probed.push({ path: candidate, source: "common", reason: messages().startup.probe.valid });
            return { installRoot: r.installRoot, probed };
        }
        probed.push({ path: candidate, source: "common", reason: r.reason });
    }

    throw new ShamelaNotFoundError(probed);
}

export function resolveJre(
    installRoot: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const envJre = process.env.SHAMELA_JRE?.trim();
    if (envJre) {
        // Accept either a directory or the executable itself.
        if (fs.existsSync(envJre)) {
            const stat = fs.statSync(envJre);
            if (stat.isFile()) return envJre;
            if (stat.isDirectory()) {
                const candidates = [
                    path.join(envJre, "bin", "java.exe"),
                    path.join(envJre, "bin", "java"),
                ];
                for (const c of candidates) if (fs.existsSync(c)) return c;
            }
        }
        throw new Error(messages().startup.jreOverrideInvalid(envJre));
    }

    // Newer Shamela installs keep the bundled JRE under a version folder named
    // "2"; older installs use "1" (issue #4 — the wrong folder makes the helper
    // exit with code 1). Probe "2" first, then "1", for every platform layout.
    const JRE_VERSION_DIRS = ["2", "1"];
    const candidates: string[] = [];
    for (const v of JRE_VERSION_DIRS) {
        if (platform === "win32") {
            candidates.push(
                path.join(installRoot, "app", "win", "64", "jre", v, "bin", "java.exe"),
                path.join(installRoot, "app", "win", "32", "jre", v, "bin", "java.exe"),
            );
        } else if (platform === "darwin") {
            // Mac Shamela ships the bundled JRE under the CPU architecture name
            // (arm64 on Apple Silicon, x86_64 on Intel), not the Windows-style
            // 32/64 split. Probe the legacy "64" path last for any older install.
            candidates.push(
                path.join(installRoot, "app", "mac", "arm64", "jre", v, "bin", "java"),
                path.join(installRoot, "app", "mac", "x86_64", "jre", v, "bin", "java"),
                path.join(installRoot, "app", "mac", "64", "jre", v, "bin", "java"),
            );
        } else {
            candidates.push(path.join(installRoot, "app", "linux", "64", "jre", v, "bin", "java"));
        }
    }

    for (const c of candidates) if (fs.existsSync(c)) return c;
    throw new Error(
        messages().startup.jreNotFound(path.join(installRoot, "app"), candidates.join(", ")),
    );
}

/**
 * The jars only the current engine ships. Their presence is what makes a
 * folder generation 2 — not its name.
 */
const GENERATION_2_JARS = ["alkhalil-analyzer-2.1.jar", "shamela-misc-1.0.0.jar"];

/**
 * Which bundled-engine generation an install carries, decided by what is
 * INSIDE the Lucene folder rather than by what the folder is called.
 *
 * The folder name was the test once, and it sent people down a blind alley:
 * reading that the extension wants `app/lucene/2`, someone with an older
 * install copies their v1 engine into a folder of that name — the obvious
 * thing to try — and the preflight waves them through into a Java class-version
 * failure that names nothing they can act on. Reading the jars catches the
 * workaround and gives them the message they needed in the first place, which
 * is that the Shamela application itself has to be updated.
 *
 * Returns "unknown" when no Lucene folder is there at all; that is a different
 * failure and gets a different message.
 */
export function resolveEngineGeneration(installRoot: string): "1" | "2" | "unknown" {
    let sawAny = false;
    for (const v of ["2", "1"] as const) {
        const dir = path.join(installRoot, "app", "lucene", v);
        if (!fs.existsSync(dir)) continue;
        sawAny = true;
        let names: string[];
        try {
            names = fs.readdirSync(dir).map((n) => n.toLowerCase());
        } catch {
            continue;
        }
        if (GENERATION_2_JARS.every((jar) => names.includes(jar))) return "2";
    }
    // A Lucene folder exists but carries none of the current engine's jars:
    // whatever it is called, it is the older generation.
    return sawAny ? "1" : "unknown";
}

export function resolveJars(installRoot: string): string[] {
    // Same version-folder split as the bundled JRE (issue #4): newer installs
    // use app/lucene/2, older ones app/lucene/1. Probe both, prefer "2".
    const probed: string[] = [];
    let luceneDir: string | null = null;
    for (const v of ["2", "1"]) {
        const candidate = path.join(installRoot, "app", "lucene", v);
        probed.push(candidate);
        if (fs.existsSync(candidate)) {
            luceneDir = candidate;
            break;
        }
    }
    if (!luceneDir) {
        throw new Error(messages().startup.luceneDirNotFound(probed.join(", ")));
    }
    const out = fs
        .readdirSync(luceneDir)
        .filter((name) => name.toLowerCase().endsWith(".jar"))
        .map((name) => path.join(luceneDir, name));
    if (out.length === 0) {
        throw new Error(messages().startup.luceneDirEmpty(luceneDir));
    }
    out.sort();
    return out;
}

function resolveHelperJar(): string {
    // SHAMELA_HELPER_JAR override is checked first, useful for smoke tests that
    // run before `npm run build` has copied the jar next to dist/.
    const envOverride = process.env.SHAMELA_HELPER_JAR?.trim();
    if (envOverride && fs.existsSync(envOverride)) return envOverride;

    // Walk up from this file to find the bundle root (the directory containing
    // either manifest.json — when running inside a packed .mcpb — or
    // package.json — during dev). The helper jar lives at <root>/helper/shamela-helper.jar.
    let current = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(current, "manifest.json")) || fs.existsSync(path.join(current, "package.json"))) {
            return path.join(current, "helper", "shamela-helper.jar");
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    // Last resort: assume two levels up (dist/index.js -> bundle root, src/server/paths.ts -> repo root differ but both yield "../helper")
    return path.resolve(__dirname, "..", "helper", "shamela-helper.jar");
}

export async function resolveAll(): Promise<ShamelaPaths> {
    const { installRoot, probed } = findInstallRoot();
    // The winning probe is the last one; when the explicit setting won, it is
    // the only one. An env probe that appears without winning was rejected —
    // that is the fact health must be able to report.
    const winner = probed[probed.length - 1]!;
    const installRootSource: ShamelaPaths["installRootSource"] =
        winner.source === "env" ? "setting" : winner.source === "registry" ? "registry" : "auto";
    const rejectedEnv =
        winner.source !== "env" ? probed.find((p) => p.source === "env") : undefined;
    const database = path.join(installRoot, "database");
    const jre = resolveJre(installRoot);
    const jars = resolveJars(installRoot);
    const helperJar = resolveHelperJar();
    const engineGeneration = resolveEngineGeneration(installRoot);
    return {
        installRoot,
        installRootSource,
        ...(rejectedEnv ? { rejectedSetting: { path: rejectedEnv.path, reason: rejectedEnv.reason } } : {}),
        database,
        jre,
        jars,
        helperJar,
        engineGeneration,
    };
}
