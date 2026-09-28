// Numbers a Preview build and writes the number into Cargo.toml, which the build and its updater
// signatures read; the number is never committed, so merging the trunk into main stays clean.
//   node scripts/preview_version.ts next <UTC YYYYMMDDHHmm> <run number> [latest stable tag]
//   node scripts/preview_version.ts write <version>
//   node scripts/preview_version.ts tag <version>
//   node scripts/preview_version.ts release <version> <commit>   (the Preview release's title and notes)
import { readFileSync, writeFileSync } from "node:fs";
import { packageVersion } from "./signatures.ts";

/** The MSI installer keeps the build count in a field that holds at most this. */
const LARGEST_MSI_FIELD = 65535;

/**
 * The release number of a Preview build: the patch after the latest stable release (or after
 * `packageVersion` before any release exists), `-preview.` and its UTC build time, which orders
 * Preview builds, and `+` the run number, which only the MSI installer reads.
 */
export function previewVersion(
  latestStable: string | null,
  packageVersionNow: string,
  builtAt: string,
  run: number,
): string {
  if (!/^\d{12}$/.test(builtAt))
    throw new Error(`build time ${builtAt} is not YYYYMMDDHHmm`);
  if (!Number.isInteger(run) || run < 0 || run > LARGEST_MSI_FIELD)
    throw new Error(`run ${run} does not fit the MSI build field`);
  const base = (latestStable ?? packageVersionNow).replace(/^v/, "");
  const [major, minor, patch] = base.split(/[.+-]/).map(Number);
  return `${major}.${minor}.${patch + 1}-preview.${builtAt}+${run}`;
}

/**
 * The tag of the Preview build `version` numbers: its release number without the `+` count only
 * the MSI installer reads, which GitHub would rewrite in a download address.
 */
export function previewTag(version: string): string {
  return `v${version.split("+")[0]}`;
}

/**
 * The title and notes of the Preview release for the build `version` numbers, naming it as the
 * settings do — the stable release it is based on and its build time — so a report matches the page.
 */
export function previewReleasePage(
  version: string,
  commit: string,
): { title: string; notes: string } {
  const match = /^(\d+)\.(\d+)\.(\d+)-preview\.(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\+\d+$/.exec(
    version,
  );
  if (!match) throw new Error(`${version} is not a Preview build`);
  const [, major, minor, patch, year, month, day, hour, minute] = match;
  const basedOn = `${major}.${minor}.${Number(patch) - 1}`;
  const builtAt = `${year}-${month}-${day} ${hour}:${minute} UTC`;
  return {
    title: `Preview | based on ${basedOn} | built ${builtAt}`,
    notes: [
      "A Preview build of main, for testing. Not a stable release.",
      "",
      `- Version: ${version}`,
      `- Based on: ${basedOn}`,
      `- Built: ${builtAt}`,
      `- Commit: ${commit.slice(0, 7)}`,
    ].join("\n"),
  };
}

/** `cargoToml` with its package version replaced by `version`, the dependencies left as they are. */
export function withPackageVersion(cargoToml: string, version: string): string {
  return cargoToml.replace(
    /^(\[package\][^[]*?^version\s*=\s*")[^"]+(")/m,
    (_, before: string, after: string) => `${before}${version}${after}`,
  );
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  const cargoPath = "src-tauri/Cargo.toml";
  const cargoToml = readFileSync(cargoPath, "utf8");
  if (command === "next") {
    const [builtAt, run, latestStable] = args;
    console.log(
      previewVersion(
        latestStable || null,
        packageVersion(cargoToml),
        builtAt,
        Number(run),
      ),
    );
  } else if (command === "write") {
    writeFileSync(cargoPath, withPackageVersion(cargoToml, args[0]));
  } else if (command === "tag") {
    console.log(previewTag(args[0]));
  } else if (command === "release") {
    console.log(JSON.stringify(previewReleasePage(args[0], args[1])));
  } else {
    console.error(
      "usage: node scripts/preview_version.ts next <YYYYMMDDHHmm> <run> [latest tag] | write <version> | tag <version> | release <version> <commit>",
    );
    process.exit(2);
  }
}
