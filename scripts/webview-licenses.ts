// Checks the licenses of the packages the webview bundles against those accepted for Rust crates,
// and writes their texts to the notice every build ships:
//   node scripts/webview-licenses.ts [output.html]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface BundledPackage {
  name: string;
  version: string;
  license: string;
  path: string;
}

/** Packages only the build depends on, whose CSS nonetheless ships in the bundle. */
const BUILD_PACKAGES_IN_BUNDLE = ["daisyui", "tailwindcss"];

/** The `accepted` list of `about.toml`, kept in step with `deny.toml`. */
export function acceptedLicenses(aboutToml: string): string[] {
  const list = /^accepted\s*=\s*\[([^\]]*)\]/m.exec(aboutToml)?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

/** Whether an SPDX expression is met by accepted licenses: one choice of an OR, every part of an AND. */
export function isAccepted(expression: string, accepted: string[]): boolean {
  return expression
    .replace(/[()]/g, "")
    .split(/\s+OR\s+/)
    .some((choice) =>
      choice
        .split(/\s+AND\s+/)
        .every((part) => accepted.includes(part.trim())),
    );
}

export function refusedPackages(
  packages: BundledPackage[],
  accepted: string[],
): BundledPackage[] {
  return packages.filter((each) => !isAccepted(each.license, accepted));
}

/** The text of the license file a package ships, whatever it names it. */
export function licenseText(path: string): string {
  const file = readdirSync(path).find((name) => /^licen[cs]e/i.test(name));
  if (!file) throw new Error(`no license file in ${path}`);
  return readFileSync(join(path, file), "utf8");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** A page naming each package with its version and license beside that license's text. */
export function noticeHtml(
  packages: (BundledPackage & { text: string })[],
): string {
  const sections = packages
    .map(
      (each) =>
        `<section><h2>${escapeHtml(each.name)} ${escapeHtml(each.version)}</h2>` +
        `<p>${escapeHtml(each.license)}</p><pre>${escapeHtml(each.text)}</pre></section>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Third-party licenses of the webview</title></head>
<body>
<h1>Third-party licenses of the webview</h1>
${sections}
</body>
</html>
`;
}

/** The runtime dependencies pnpm resolves, and the build packages whose CSS ships with them. */
function bundledPackages(): BundledPackage[] {
  const listed = JSON.parse(
    execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
      encoding: "utf8",
    }),
  ) as Record<
    string,
    { name: string; versions: string[]; license: string; paths: string[] }[]
  >;
  const runtime = Object.values(listed)
    .flat()
    .map((each) => ({
      name: each.name,
      version: each.versions[0],
      license: each.license,
      path: each.paths[0],
    }));
  const build = BUILD_PACKAGES_IN_BUNDLE.map((name) => {
    const path = join("node_modules", name);
    const manifest = JSON.parse(
      readFileSync(join(path, "package.json"), "utf8"),
    ) as { version: string; license: string };
    return { name, version: manifest.version, license: manifest.license, path };
  });
  return [...runtime, ...build].sort((a, b) => a.name.localeCompare(b.name));
}

if (import.meta.main) {
  const output = process.argv[2] ?? "THIRD-PARTY-LICENSES-WEBVIEW.html";
  const accepted = acceptedLicenses(
    readFileSync("src-tauri/about.toml", "utf8"),
  );
  const packages = bundledPackages();
  const refused = refusedPackages(packages, accepted);
  if (refused.length > 0) {
    for (const each of refused)
      console.error(`${each.name} ${each.version}: ${each.license} is not accepted`);
    process.exit(1);
  }
  writeFileSync(
    output,
    noticeHtml(packages.map((each) => ({ ...each, text: licenseText(each.path) }))),
  );
}
