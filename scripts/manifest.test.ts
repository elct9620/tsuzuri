// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { previewAssetName, releasesUrl, updateManifest } from "./manifest";
import { CLI_SIGNATURE, VERSIONED_SIGNATURE } from "./test_signatures";

const RELEASES = "https://github.com/elct9620/tsuzuri/releases";

/** The assets release-assets collects for v0.2.0, each package beside its signature. */
const PACKAGES = [
  "Tsuzuri.app.tar.gz",
  "Tsuzuri_0.2.0_x64-setup.exe",
  "Tsuzuri_0.2.0_x64_en-US.msi",
  "Tsuzuri_0.2.0_amd64.deb",
  "Tsuzuri-0.2.0-1.x86_64.rpm",
];
const ASSETS = [
  ...PACKAGES,
  ...PACKAGES.map((name) => `${name}.sig`),
  "Tsuzuri_0.2.0_aarch64.dmg",
  "ffmpeg-8.0.tar.xz",
  "SHA256SUMS",
];

/** Each package signed by the Tauri CLI for 0.2.0. */
const signatureByName = () => VERSIONED_SIGNATURE;

describe("update manifest", () => {
  it("names the release and each install format's package with its signature", () => {
    const manifest = updateManifest("v0.2.0", ASSETS, signatureByName, RELEASES);

    expect(manifest).toEqual({
      version: "0.2.0",
      platforms: {
        "darwin-aarch64-app": {
          url: `${RELEASES}/download/v0.2.0/Tsuzuri.app.tar.gz`,
          signature: VERSIONED_SIGNATURE,
        },
        "windows-x86_64-nsis": {
          url: `${RELEASES}/download/v0.2.0/Tsuzuri_0.2.0_x64-setup.exe`,
          signature: VERSIONED_SIGNATURE,
        },
        "windows-x86_64-msi": {
          url: `${RELEASES}/download/v0.2.0/Tsuzuri_0.2.0_x64_en-US.msi`,
          signature: VERSIONED_SIGNATURE,
        },
        "linux-x86_64-deb": {
          url: `${RELEASES}/download/v0.2.0/Tsuzuri_0.2.0_amd64.deb`,
          signature: VERSIONED_SIGNATURE,
        },
        "linux-x86_64-rpm": {
          url: `${RELEASES}/download/v0.2.0/Tsuzuri-0.2.0-1.x86_64.rpm`,
          signature: VERSIONED_SIGNATURE,
        },
      },
    });
  });

  it("refuses a release missing an install format", () => {
    const assets = ASSETS.filter((name) => !name.includes(".rpm"));

    expect(() =>
      updateManifest("v0.2.0", assets, signatureByName, RELEASES),
    ).toThrow("linux-x86_64-rpm needs one package ending in .rpm, found 0");
  });

  it("refuses a package without its updater signature", () => {
    const assets = ASSETS.filter((name) => name !== "Tsuzuri_0.2.0_amd64.deb.sig");

    expect(() =>
      updateManifest("v0.2.0", assets, signatureByName, RELEASES),
    ).toThrow("Tsuzuri_0.2.0_amd64.deb has no updater signature");
  });

  it("refuses a package signed for no release number", () => {
    expect(() =>
      updateManifest("v0.2.0", ASSETS, () => CLI_SIGNATURE, RELEASES),
    ).toThrow("Tsuzuri.app.tar.gz is signed for no release number");
  });

  it("refuses a package signed for another release", () => {
    expect(() =>
      updateManifest("v0.3.0", ASSETS, signatureByName, RELEASES),
    ).toThrow("Tsuzuri.app.tar.gz is signed for 0.2.0, not 0.3.0");
  });

  it("reads the releases page from the repository Cargo.toml names", () => {
    const cargoToml = `[package]\nname = "tsuzuri"\nrepository = "https://github.com/elct9620/tsuzuri"\n`;

    expect(releasesUrl(cargoToml)).toBe(RELEASES);
  });

  it("names each Preview package by its release number, its signature following", () => {
    const names = [
      "Tsuzuri_0.2.1-preview.202609281430+12_x64-setup.exe",
      "Tsuzuri_0.2.1-preview.202609281430+12_x64-setup.exe.sig",
      "Tsuzuri.app.tar.gz.sig",
      "Tsuzuri_0.2.1-preview.202609281430+12_aarch64.dmg",
      "SHA256SUMS",
    ].map((name) => previewAssetName(name, "0.2.1-preview.202609281430+12"));

    expect(names).toEqual([
      "Tsuzuri_0.2.1-preview.202609281430_x64-setup.exe",
      "Tsuzuri_0.2.1-preview.202609281430_x64-setup.exe.sig",
      "Tsuzuri_0.2.1-preview.202609281430_aarch64.app.tar.gz.sig",
      "Tsuzuri_0.2.1-preview.202609281430_aarch64.dmg",
      "SHA256SUMS",
    ]);
  });

  it("announces a Preview build by the number its packages were signed for, without rpm", () => {
    const previewPackages = [
      "Tsuzuri_0.2.0_aarch64.app.tar.gz",
      "Tsuzuri_0.2.0_x64-setup.exe",
      "Tsuzuri_0.2.0_x64_en-US.msi",
      "Tsuzuri_0.2.0_amd64.deb",
    ];
    const assets = [
      ...previewPackages,
      ...previewPackages.map((name) => `${name}.sig`),
    ];

    const manifest = updateManifest(
      "v0.2.0",
      assets,
      signatureByName,
      RELEASES,
      "preview",
    );

    expect([
      manifest.version,
      Object.keys(manifest.platforms),
      manifest.platforms["windows-x86_64-nsis"].url,
    ]).toEqual([
      "0.2.0",
      [
        "darwin-aarch64-app",
        "windows-x86_64-nsis",
        "windows-x86_64-msi",
        "linux-x86_64-deb",
      ],
      `${RELEASES}/download/v0.2.0/Tsuzuri_0.2.0_x64-setup.exe`,
    ]);
  });

  it("refuses a Preview build whose packages were signed for no release number", () => {
    const previewPackages = [
      "Tsuzuri_0.2.0_aarch64.app.tar.gz",
      "Tsuzuri_0.2.0_x64-setup.exe",
      "Tsuzuri_0.2.0_x64_en-US.msi",
      "Tsuzuri_0.2.0_amd64.deb",
    ];
    const assets = [
      ...previewPackages,
      ...previewPackages.map((name) => `${name}.sig`),
    ];

    expect(() =>
      updateManifest("v0.2.0", assets, () => CLI_SIGNATURE, RELEASES, "preview"),
    ).toThrow("Tsuzuri_0.2.0_aarch64.app.tar.gz is signed for no release number");
  });
});
