// Lays out the update site: the pages under site/ and each Update Channel's manifest, mirrored from
// the releases, so an installed Tsuzuri reads an address it owns.
//   node scripts/site.ts <stable latest.json or -> <preview latest.json or -> <output directory>
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Manifest {
  version: string;
}

/** The identifiers of a release number's pre-release part, none for a stable release; build metadata ignored. */
function preReleaseOf(version: string): string[] {
  const withoutBuild = version.split("+")[0];
  const at = withoutBuild.indexOf("-");
  return at < 0 ? [] : withoutBuild.slice(at + 1).split(".");
}

/** Negative, zero or positive as release number `a` comes before, with or after `b`, by SemVer precedence. */
export function compareVersions(a: string, b: string): number {
  const core = (version: string) =>
    version.split(/[-+]/)[0].split(".").map(Number);
  const [coreA, coreB] = [core(a), core(b)];
  for (let at = 0; at < 3; at++)
    if (coreA[at] !== coreB[at]) return coreA[at] - coreB[at];
  const [preA, preB] = [preReleaseOf(a), preReleaseOf(b)];
  if (preA.length === 0 || preB.length === 0) return preB.length - preA.length;
  for (let at = 0; at < Math.min(preA.length, preB.length); at++) {
    const [left, right] = [preA[at], preB[at]];
    if (left === right) continue;
    const [isNumberLeft, isNumberRight] = [/^\d+$/.test(left), /^\d+$/.test(right)];
    if (isNumberLeft && isNumberRight) return Number(left) - Number(right);
    if (isNumberLeft !== isNumberRight) return isNumberLeft ? -1 : 1;
    return left < right ? -1 : 1;
  }
  return preA.length - preB.length;
}

/**
 * The manifest the Preview channel publishes: the Preview build's, unless a stable release has
 * since passed it, so preview users receive each stable release too.
 */
export function previewChannelManifest<T extends Manifest>(
  stable: T | null,
  preview: T | null,
): T | null {
  if (!stable || !preview) return preview ?? stable;
  return compareVersions(stable.version, preview.version) > 0 ? stable : preview;
}

function readManifest(path: string): Manifest | null {
  return path !== "-" && existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Manifest)
    : null;
}

if (import.meta.main) {
  const [stablePath, previewPath, output] = process.argv.slice(2);
  if (!stablePath || !previewPath || !output) {
    console.error(
      "usage: node scripts/site.ts <stable latest.json or -> <preview latest.json or -> <output directory>",
    );
    process.exit(2);
  }
  cpSync("site", output, { recursive: true });
  mkdirSync(join(output, "updates"), { recursive: true });
  const stable = readManifest(stablePath);
  const preview = previewChannelManifest(stable, readManifest(previewPath));
  for (const [channel, manifest] of [
    ["stable", stable],
    ["preview", preview],
  ] as const) {
    if (!manifest) continue;
    writeFileSync(
      join(output, "updates", `${channel}.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    console.log(`${channel}: ${manifest.version}`);
  }
}
