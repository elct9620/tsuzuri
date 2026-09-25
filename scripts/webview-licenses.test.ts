// @vitest-environment happy-dom
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptedLicenses,
  licenseText,
  noticeHtml,
  refusedPackages,
} from "./webview-licenses";

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
  path: "/nowhere",
});

describe("webview licenses", () => {
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

    const notice = noticeHtml([
      {
        name: "lucide",
        version: "1.48.0",
        license: "ISC",
        path,
        text: licenseText(path),
      },
    ]);

    expect(notice).toContain(
      "<h2>lucide 1.48.0</h2><p>ISC</p><pre>ISC License &lt;text&gt;</pre>",
    );
  });
});
