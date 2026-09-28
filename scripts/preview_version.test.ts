// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { previewVersion, withPackageVersion } from "./preview_version";
import { packageVersion } from "./signatures";

const CARGO_TOML = `[package]
name = "tsuzuri"
version = "0.1.0"

[dependencies]
serde = { version = "1", features = ["derive"] }
`;

describe("preview version", () => {
  it("numbers a Preview build as the patch after the latest stable release", () => {
    expect(previewVersion("v0.2.0", "0.1.0", "202609281430", 12)).toBe(
      "0.2.1-preview.202609281430+12",
    );
  });

  it("follows the package version before any stable release exists", () => {
    expect(previewVersion(null, "0.1.0", "202609281430", 12)).toBe(
      "0.1.1-preview.202609281430+12",
    );
  });

  it("refuses a run number the MSI build field cannot hold", () => {
    expect(() => previewVersion("v0.2.0", "0.1.0", "202609281430", 65536)).toThrow(
      "run 65536 does not fit the MSI build field",
    );
  });

  it("writes the version into the package, leaving the dependencies alone", () => {
    const written = withPackageVersion(
      CARGO_TOML,
      "0.2.1-preview.202609281430+12",
    );

    expect([packageVersion(written), written.includes('version = "1"')]).toEqual(
      ["0.2.1-preview.202609281430+12", true],
    );
  });
});
