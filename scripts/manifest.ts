// Writes the update manifest an installed Tsuzuri reads for its Update Channel: for each install
// format, the package the updater installs and its signature. A Preview build's packages are first
// given fixed names, since its release number carries a `+` that GitHub would rewrite in a file name.
//   node scripts/manifest.ts <tag> <assets directory> [--preview]
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

/** rpm ranks a Preview build above the stable release that follows it, so no Preview build is one. */
const PREVIEW_TARGETS = Object.keys(PACKAGE_SUFFIX_BY_TARGET).filter(
  (target) => target !== "linux-x86_64-rpm",
);

/** The fixed name each Preview package takes, so every build replaces the one before it. */
const PREVIEW_NAME_BY_SUFFIX = {
  ".app.tar.gz": "Tsuzuri-preview_aarch64.app.tar.gz",
  ".dmg": "Tsuzuri-preview_aarch64.dmg",
  "-setup.exe": "Tsuzuri-preview_x64-setup.exe",
  ".msi": "Tsuzuri-preview_x64.msi",
  ".deb": "Tsuzuri-preview_amd64.deb",
} as const;

export type UpdateChannel = "stable" | "preview";

export interface UpdateManifest {
  version: string;
  platforms: Record<string, { url: string; signature: string }>;
}

/** The fixed name a Preview build gives `assetName`, its signature following its package. */
export function previewAssetName(assetName: string): string {
  const packageName = assetName.replace(/\.sig$/, "");
  const signatureSuffix = assetName.slice(packageName.length);
  const fixed = Object.entries(PREVIEW_NAME_BY_SUFFIX).find(([suffix]) =>
    packageName.endsWith(suffix),
  )?.[1];
  return fixed ? `${fixed}${signatureSuffix}` : assetName;
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
  const [tag, assets, flag] = process.argv.slice(2);
  if (!tag || !assets) {
    console.error(
      "usage: node scripts/manifest.ts <tag> <assets directory> [--preview]",
    );
    process.exit(2);
  }
  const channel: UpdateChannel = flag === "--preview" ? "preview" : "stable";
  if (channel === "preview")
    for (const name of readdirSync(assets))
      renameSync(join(assets, name), join(assets, previewAssetName(name)));
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
  console.log(`${manifest.version}\n${Object.keys(manifest.platforms).join("\n")}`);
}
