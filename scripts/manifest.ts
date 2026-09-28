// Writes the update manifest an installed Tsuzuri reads from the latest release: for each install
// format, the package the updater installs and its signature.
//   node scripts/manifest.ts <tag> <assets directory>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { signedVersion } from "./signatures.ts";

/**
 * The package each install format updates from, by the platform key the updater looks up first:
 * `<os>-<arch>-<installer>`, so an MSI install never runs the NSIS installer.
 */
const PACKAGE_SUFFIX_BY_TARGET = {
  "darwin-aarch64-app": ".app.tar.gz",
  "windows-x86_64-nsis": "-setup.exe",
  "windows-x86_64-msi": ".msi",
  "linux-x86_64-deb": ".deb",
  "linux-x86_64-rpm": ".rpm",
} as const;

export interface UpdateManifest {
  version: string;
  platforms: Record<string, { url: string; signature: string }>;
}

/**
 * The manifest announcing the release `tag`, whose assets are `assetNames` in `releasesUrl`.
 * Each install format needs exactly one package and its signature, since a format left out
 * would leave its users on the release they have, and each signature must be bound to this
 * release, since the updater refuses one bound to another.
 */
export function updateManifest(
  tag: string,
  assetNames: string[],
  signatureByName: (assetName: string) => string,
  releasesUrl: string,
): UpdateManifest {
  const version = tag.replace(/^v/, "");
  const platforms: UpdateManifest["platforms"] = {};
  for (const [target, suffix] of Object.entries(PACKAGE_SUFFIX_BY_TARGET)) {
    const packages = assetNames.filter((name) => name.endsWith(suffix));
    if (packages.length !== 1)
      throw new Error(
        `${target} needs one package ending in ${suffix}, found ${packages.length}`,
      );
    const [packageName] = packages;
    if (!assetNames.includes(`${packageName}.sig`))
      throw new Error(`${packageName} has no updater signature`);
    const signature = signatureByName(`${packageName}.sig`).trim();
    const boundVersion = signedVersion(signature);
    if (boundVersion !== version)
      throw new Error(
        `${packageName} is signed for ${boundVersion ?? "no version"}, not ${version}`,
      );
    platforms[target] = {
      url: `${releasesUrl}/download/${encodeURIComponent(tag)}/${encodeURIComponent(packageName)}`,
      signature,
    };
  }
  return { version, platforms };
}

/** The releases page of the repository Cargo.toml names, as the app's About opens it. */
export function releasesUrl(cargoToml: string): string {
  const repository = /^repository\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1];
  if (!repository) throw new Error("Cargo.toml names no repository");
  return `${repository}/releases`;
}

if (import.meta.main) {
  const [tag, assets] = process.argv.slice(2);
  if (!tag || !assets) {
    console.error("usage: node scripts/manifest.ts <tag> <assets directory>");
    process.exit(2);
  }
  const manifest = updateManifest(
    tag,
    readdirSync(assets),
    (name) => readFileSync(join(assets, name), "utf8"),
    releasesUrl(readFileSync("src-tauri/Cargo.toml", "utf8")),
  );
  writeFileSync(
    join(assets, "latest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(Object.keys(manifest.platforms).join("\n"));
}
