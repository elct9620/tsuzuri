// @vitest-environment happy-dom
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import {
  type BundledPackage,
  listBundledPackages,
  parakeetWork,
  acceptedLicenses,
  licenseText,
  type Notice,
  noticeHtml,
  refusedPackages,
  variantLicenses,
} from "./licenses";

const ABOUT_TOML = `targets = ["aarch64-apple-darwin"]
accepted = [
    "Apache-2.0",
    "ISC",
    "MIT",
]
`;

const bundled = (license: string) => ({
  name: "some-package",
  version: "1.0.0",
  license,
  text: "",
});

const emptyNotice = (): Notice => ({
  tsuzuri: "",
  variants: [],
  data: [],
  crates: { licenses: [] },
  packages: [],
});

/** Installs under `root` a package exporting `name`, under MIT with its license file. */
const installPackage = (root: string, name: string) => {
  const path = join(root, "node_modules", name);
  mkdirSync(path, { recursive: true });
  writeFileSync(
    join(path, "package.json"),
    JSON.stringify({ name, version: "1.0.0", license: "MIT", main: "index.js" }),
  );
  writeFileSync(join(path, "index.js"), `export default "${name}";`);
  writeFileSync(join(path, "LICENSE"), `MIT License for ${name}`);
};

const noticeDocument = (notice: Notice) =>
  new DOMParser().parseFromString(noticeHtml(notice), "text/html");

describe("licenses", () => {
  // @behavior LC-001
  it("accepts a package under a license the project accepts", () => {
    const accepted = acceptedLicenses(ABOUT_TOML);

    expect(refusedPackages([bundled("Apache-2.0 OR MIT")], accepted)).toEqual(
      [],
    );
  });

  // @behavior LC-002
  it("refuses a package under a license the project does not accept", () => {
    const accepted = acceptedLicenses(ABOUT_TOML);

    expect(refusedPackages([bundled("GPL-3.0")], accepted)).toEqual([
      bundled("GPL-3.0"),
    ]);
  });

  // @behavior LC-003
  it("carries each bundled package's license text into the notice", () => {
    const path = mkdtempSync(join(tmpdir(), "lucide-"));
    writeFileSync(join(path, "LICENSE"), "ISC License <text>");

    const notice = noticeHtml({
      ...emptyNotice(),
      packages: [
        {
          name: "lucide",
          version: "1.48.0",
          license: "ISC",
          text: licenseText(path),
        },
      ],
    });

    expect(notice).toContain(
      "<h3>lucide 1.48.0</h3><p>ISC</p><pre>ISC License &lt;text&gt;</pre>",
    );
  });

  // @behavior LC-011
  it("leaves out a package only the build uses", async () => {
    const root = mkdtempSync(join(tmpdir(), "webview-"));
    installPackage(root, "kept");
    installPackage(root, "build-only");
    writeFileSync(
      join(root, "index.html"),
      '<script type="module" src="./main.js"></script>',
    );
    writeFileSync(join(root, "main.js"), 'import kept from "kept";\nconsole.log(kept);');
    const listingFile = join(root, "bundled-packages.json");

    await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [listBundledPackages(listingFile)],
      build: { write: false },
    });

    const packages = JSON.parse(
      readFileSync(listingFile, "utf8"),
    ) as BundledPackage[];
    expect(packages.map((each) => each.name)).toEqual(["kept"]);
  });

  // @behavior LC-004
  it("opens the notice with Tsuzuri's own license", () => {
    const notice = noticeDocument({
      ...emptyNotice(),
      tsuzuri: "Apache License Version 2.0",
      data: [{ name: "OpenCC dictionaries", text: "Apache License" }],
    });

    const first = notice.querySelector("section");

    expect(first?.querySelector("h2")?.textContent).toBe("Tsuzuri");
    expect(first?.querySelector("pre")?.textContent).toBe(
      "Apache License Version 2.0",
    );
  });

  // @behavior LC-005
  it("carries the licenses a Bundled Variant keeps", () => {
    const vendor = mkdtempSync(join(tmpdir(), "vendor-"));
    const variant = join(vendor, "llama", "metal");
    mkdirSync(join(variant, "licenses", "cpp-httplib"), { recursive: true });
    writeFileSync(join(variant, "VERSION"), "b11149\n");
    writeFileSync(
      join(variant, "licenses", "cpp-httplib", "LICENSE"),
      "The MIT License <httplib>",
    );

    const notice = noticeHtml({
      ...emptyNotice(),
      variants: variantLicenses(vendor),
    });

    expect(notice).toContain(
      "<h3>llama metal b11149</h3>\n<h4>cpp-httplib</h4><pre>The MIT License &lt;httplib&gt;</pre>",
    );
  });

  // @behavior LC-006
  it("carries each crate's license with the crates it covers", () => {
    const notice = noticeHtml({
      ...emptyNotice(),
      crates: {
        licenses: [
          {
            name: "MIT License",
            text: "Permission is hereby granted",
            used_by: [{ crate: { name: "serde", version: "1.0.228" } }],
          },
        ],
      },
    });

    expect(notice).toContain(
      "<h3>MIT License</h3><ul><li>serde 1.0.228</li></ul><pre>Permission is hereby granted</pre>",
    );
  });

  // @behavior LC-010
  it("carries the license of the code Speaker Diarization adapts", () => {
    const work = parakeetWork();

    expect([
      work.name.startsWith("parakeet-rs 0.3.8"),
      work.text.startsWith("MIT License"),
      work.text.includes("Copyright (c) 2025 Enes Altun"),
    ]).toEqual([true, true, true]);
  });
});
