// Checks the licenses of the packages the webview bundles against those accepted for Rust crates,
// and writes the License Notice: the license texts of Tsuzuri and of everything it ships.
//   vite build && node scripts/licenses.ts <cargo-about.json> [output.html]
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import licenseModule from "rollup-plugin-license";

// The package sets `module.exports` to the plugin but types it as an ES default export,
// so under `nodenext` the default import is typed as the module while Node hands over the plugin.
const license = licenseModule as unknown as typeof licenseModule.default;

export interface BundledPackage {
  name: string;
  version: string;
  license: string;
  text: string;
}

/** Where `vite build` lists the packages the bundle carries. */
export const BUNDLED_PACKAGES_FILE = "bundled-packages.json";

/** A work named beside the text of its license. */
export interface LicensedWork {
  name: string;
  text: string;
}

/** The licenses one Bundled Variant keeps for everything its programs carry. */
export interface VariantLicenses {
  component: string;
  variant: string;
  version: string;
  works: LicensedWork[];
}

/** The part of cargo-about's JSON the notice reads: each license with the crates it covers. */
export interface CrateLicenses {
  licenses: {
    name: string;
    text: string;
    used_by: { crate: { name: string; version: string } }[];
  }[];
}

export interface Notice {
  tsuzuri: string;
  variants: VariantLicenses[];
  data: LicensedWork[];
  crates: CrateLicenses;
  packages: BundledPackage[];
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

/** Every file of a directory one after another, for a project whose terms span several. */
function directoryText(path: string): string {
  return readdirSync(path)
    .sort()
    .map((name) => readFileSync(join(path, name), "utf8").trimEnd())
    .join("\n\n");
}

/** The licenses each Variant under `vendor/` keeps in `licenses/<project>/`, as `scripts/vendor.sh` lays them down. */
export function variantLicenses(vendor: string): VariantLicenses[] {
  if (!existsSync(vendor)) return [];
  return readdirSync(vendor)
    .filter((component) => !component.startsWith("."))
    .sort()
    .flatMap((component) =>
      readdirSync(join(vendor, component))
        .sort()
        .filter((variant) =>
          existsSync(join(vendor, component, variant, "licenses")),
        )
        .map((variant) => {
          const path = join(vendor, component, variant);
          return {
            component,
            variant,
            version: readFileSync(join(path, "VERSION"), "utf8").trim(),
            works: readdirSync(join(path, "licenses"))
              .sort()
              .map((name) => ({
                name,
                text: directoryText(join(path, "licenses", name)),
              })),
          };
        }),
    );
}

/** The OpenCC dictionaries compiled into Tsuzuri, named by the release `src-tauri/opencc/README.md` records. */
function openccWork(): LicensedWork {
  const readme = readFileSync("src-tauri/opencc/README.md", "utf8");
  const release = /\| Release \| `([^`]+)`/.exec(readme)?.[1] ?? "";
  return {
    name: `OpenCC dictionaries ${release}`,
    text: readFileSync("src-tauri/opencc/LICENSE", "utf8"),
  };
}

/** The parakeet-rs code Speaker Diarization adapts, under the license kept beside it. */
export function parakeetWork(): LicensedWork {
  return {
    name: "parakeet-rs 0.3.8, adapted in src-tauri/src/diarization",
    text: readFileSync("src-tauri/src/diarization/LICENSE-parakeet-rs", "utf8"),
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function workHtml(heading: string, work: LicensedWork): string {
  return `<${heading}>${escapeHtml(work.name)}</${heading}><pre>${escapeHtml(work.text)}</pre>`;
}

function sectionHtml(id: string, title: string, body: string[]): string {
  return `<section id="${id}"><h2>${title}</h2>\n${body.join("\n")}\n</section>`;
}

/** The License Notice: Tsuzuri first, then what ships with it from the outside in. */
export function noticeHtml(notice: Notice): string {
  const sections = [
    sectionHtml("tsuzuri", "Tsuzuri", [
      `<pre>${escapeHtml(notice.tsuzuri)}</pre>`,
    ]),
    sectionHtml(
      "programs",
      "Bundled programs",
      notice.variants.map(
        (each) =>
          `<h3>${escapeHtml(`${each.component} ${each.variant} ${each.version}`)}</h3>\n` +
          each.works.map((work) => workHtml("h4", work)).join("\n"),
      ),
    ),
    sectionHtml(
      "data",
      "Code and data compiled into Tsuzuri",
      notice.data.map((work) => workHtml("h3", work)),
    ),
    sectionHtml(
      "crates",
      "Rust crates",
      notice.crates.licenses.map(
        (license) =>
          `<h3>${escapeHtml(license.name)}</h3><ul>` +
          license.used_by
            .map(
              (each) =>
                `<li>${escapeHtml(`${each.crate.name} ${each.crate.version}`)}</li>`,
            )
            .join("") +
          `</ul><pre>${escapeHtml(license.text)}</pre>`,
      ),
    ),
    sectionHtml(
      "webview",
      "Webview packages",
      notice.packages.map(
        (each) =>
          `<h3>${escapeHtml(each.name)} ${escapeHtml(each.version)}</h3>` +
          `<p>${escapeHtml(each.license)}</p><pre>${escapeHtml(each.text)}</pre>`,
      ),
    ),
  ];
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Licenses</title>
<style>
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { max-width: 50rem; margin: 0 auto; padding: 1rem; }
pre { white-space: pre-wrap; font-size: 0.8rem; }
</style>
</head>
<body>
<h1>Licenses</h1>
${sections.join("\n")}
</body>
</html>
`;
}

/** A Vite plugin listing, into `file`, each package the bundle carries with the license text it ships. */
export function listBundledPackages(file = BUNDLED_PACKAGES_FILE) {
  return license({
    thirdParty: {
      output: {
        // The plugin makes the file's directory first, which a bare name lacks.
        file: resolve(file),
        template: (dependencies) =>
          JSON.stringify(
            dependencies.map((each) => ({
              name: each.name,
              version: each.version,
              license: each.license,
              text: each.licenseText,
            })),
          ),
      },
    },
  });
}

/** The packages `vite build` listed, and the build packages whose CSS ships with them. */
function bundledPackages(file: string): BundledPackage[] {
  const listing = JSON.parse(readFileSync(file, "utf8")) as (Omit<
    BundledPackage,
    "text"
  > & { text: string | null })[];
  const bundle = listing.map((each) => {
    if (each.text === null)
      throw new Error(`no license text in ${each.name} ${each.version}`);
    return { ...each, text: each.text };
  });
  const build = BUILD_PACKAGES_IN_BUNDLE.map((name) => {
    const path = join("node_modules", name);
    const manifest = JSON.parse(
      readFileSync(join(path, "package.json"), "utf8"),
    ) as { version: string; license: string };
    return {
      name,
      version: manifest.version,
      license: manifest.license,
      text: licenseText(path),
    };
  });
  return [...bundle, ...build].sort((a, b) => a.name.localeCompare(b.name));
}

if (import.meta.main) {
  const [crateJson, output = "public/LICENSE.html"] = process.argv.slice(2);
  if (!crateJson) {
    console.error("usage: node scripts/licenses.ts <cargo-about.json> [output.html]");
    process.exit(2);
  }
  const accepted = acceptedLicenses(
    readFileSync("src-tauri/about.toml", "utf8"),
  );
  const packages = bundledPackages(BUNDLED_PACKAGES_FILE);
  const refused = refusedPackages(packages, accepted);
  if (refused.length > 0) {
    for (const each of refused)
      console.error(`${each.name} ${each.version}: ${each.license} is not accepted`);
    process.exit(1);
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    noticeHtml({
      tsuzuri: readFileSync("LICENSE", "utf8"),
      variants: variantLicenses("vendor"),
      data: [openccWork(), parakeetWork()],
      crates: JSON.parse(readFileSync(crateJson, "utf8")) as CrateLicenses,
      packages,
    }),
  );
}
