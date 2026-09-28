// Writes the update manifest an installed Tsuzuri reads for its Update Channel: for each install
// format, the package the updater installs and its signature. A Preview build's packages are first
// named by its release number without the `+` count, which GitHub would rewrite in a file name, and
// its tag is worked out from the number its packages were signed for.
//   node scripts/manifest.ts <tag> <assets directory>
//   node scripts/manifest.ts --preview <assets directory>
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { previewTag } from "./preview_version.ts";
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

/** rpm ranks a Preview build above the stable release that follows it, so no Preview build is one. */
const PREVIEW_TARGETS = Object.keys(PACKAGE_SUFFIX_BY_TARGET).filter(
  (target) => target !== "linux-x86_64-rpm",
);

export type UpdateChannel = "stable" | "preview";

export interface UpdateManifest {
  version: string;
  platforms: Record<string, { url: string; signature: string }>;
}

/**
 * The name a Preview build numbered `version` gives `assetName`: without the `+` count, and the
 * macOS app archive, which the bundler leaves unnumbered, numbered like the others.
 */
export function previewAssetName(assetName: string, version: string): string {
  const numbered = previewTag(version).slice(1);
  return assetName
    .replace(version, numbered)
    .replace(/^Tsuzuri\.app\.tar\.gz/, `Tsuzuri_${numbered}_aarch64.app.tar.gz`);
}

/**
 * The manifest announcing the release `tag`, whose assets are `assetNames` in `releasesUrl`.
 * Each install format of the channel needs exactly one package and its signature, since a format
 * left out would leave its users on the release they have, and every signature must be bound to
 * one release number, since the updater refuses a package signed for another: the tag's for a
 * stable release, and for the Preview build whatever number its packages were built with.
 */
export function updateManifest(
  tag: string,
  assetNames: string[],
  signatureByName: (assetName: string) => string,
  releasesUrl: string,
  channel: UpdateChannel = "stable",
): UpdateManifest {
  const targets =
    channel === "preview"
      ? PREVIEW_TARGETS
      : Object.keys(PACKAGE_SUFFIX_BY_TARGET);
  let version = channel === "stable" ? tag.replace(/^v/, "") : undefined;
  const platforms: UpdateManifest["platforms"] = {};
  for (const target of targets) {
    const suffix =
      PACKAGE_SUFFIX_BY_TARGET[target as keyof typeof PACKAGE_SUFFIX_BY_TARGET];
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
    if (boundVersion === undefined)
      throw new Error(`${packageName} is signed for no release number`);
    version ??= boundVersion;
    if (boundVersion !== version)
      throw new Error(
        `${packageName} is signed for ${boundVersion}, not ${version}`,
      );
    platforms[target] = {
      url: `${releasesUrl}/download/${encodeURIComponent(tag)}/${encodeURIComponent(packageName)}`,
      signature,
    };
  }
  return { version: version!, platforms };
}

/** The releases page of the repository Cargo.toml names, as the app's About opens it. */
export function releasesUrl(cargoToml: string): string {
  const repository = /^repository\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1];
  if (!repository) throw new Error("Cargo.toml names no repository");
  return `${repository}/releases`;
}

if (import.meta.main) {
  const [first, assets] = process.argv.slice(2);
  if (!first || !assets) {
    console.error(
      "usage: node scripts/manifest.ts <tag> <assets directory> | --preview <assets directory>",
    );
    process.exit(2);
  }
  const channel: UpdateChannel = first === "--preview" ? "preview" : "stable";
  let tag = first;
  if (channel === "preview") {
    const signatureName = readdirSync(assets).find((name) => name.endsWith(".sig"));
    const version =
      signatureName &&
      signedVersion(readFileSync(join(assets, signatureName), "utf8"));
    if (!version) throw new Error(`no signed release number in ${assets}`);
    tag = previewTag(version);
    for (const name of readdirSync(assets))
      renameSync(join(assets, name), join(assets, previewAssetName(name, version)));
  }
  const manifest = updateManifest(
    tag,
    readdirSync(assets),
    (name) => readFileSync(join(assets, name), "utf8"),
    releasesUrl(readFileSync("src-tauri/Cargo.toml", "utf8")),
    channel,
  );
  writeFileSync(
    join(assets, "latest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`${tag}\n${manifest.version}\n${Object.keys(manifest.platforms).join("\n")}`);
}
