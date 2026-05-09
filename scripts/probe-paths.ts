/**
 * Dev script: print everything paths.ts resolves and the registry probe results.
 * Run with: npx tsx scripts/probe-paths.ts
 */

import { commonLocations, probeRegistry, resolveAll, ShamelaNotFoundError } from "../src/server/paths.js";

async function main() {
    console.log(`Platform: ${process.platform}`);
    console.log(`Node: ${process.version}`);
    console.log();

    console.log("Registry probe (Windows only):");
    if (process.platform === "win32") {
        const matches = probeRegistry();
        if (matches.length === 0) {
            console.log("  (no Shamela entry found in HKLM or HKCU Uninstall keys)");
        } else {
            for (const m of matches) console.log(`  ${m}`);
        }
    } else {
        console.log("  (skipped: not Windows)");
    }
    console.log();

    console.log("Common locations:");
    for (const loc of commonLocations()) console.log(`  ${loc}`);
    console.log();

    try {
        const paths = await resolveAll();
        console.log("Resolved:");
        console.log(`  install root: ${paths.installRoot}`);
        console.log(`  database:     ${paths.database}`);
        console.log(`  jre:          ${paths.jre}`);
        console.log(`  helperJar:    ${paths.helperJar}`);
        console.log(`  jars (${paths.jars.length}):`);
        for (const j of paths.jars) console.log(`    ${j}`);
    } catch (err) {
        if (err instanceof ShamelaNotFoundError) {
            console.error("FAILED:");
            console.error(err.message);
        } else {
            console.error("FAILED:", (err as Error).message);
        }
        process.exit(1);
    }
}

main();
