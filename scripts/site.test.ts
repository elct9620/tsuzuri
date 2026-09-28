// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { compareVersions, previewChannelManifest } from "./site";

const manifest = (version: string) => ({ version });

describe("update site", () => {
  it("orders release numbers as SemVer does, ignoring build metadata", () => {
    const ordered = [
      "0.2.0",
      "0.2.1-preview.202609281430+12",
      "0.2.1-preview.202609291015+13",
      "0.2.1",
      "0.3.0",
    ];

    const sorted = [...ordered].reverse().sort(compareVersions);

    expect(sorted).toEqual(ordered);
  });

  it("publishes the Preview build to the Preview channel while it is newer", () => {
    const chosen = previewChannelManifest(
      manifest("0.2.0"),
      manifest("0.2.1-preview.202609281430+12"),
    );

    expect(chosen?.version).toBe("0.2.1-preview.202609281430+12");
  });

  it("publishes a stable release that passed the Preview build to the Preview channel", () => {
    const chosen = previewChannelManifest(
      manifest("0.2.1"),
      manifest("0.2.1-preview.202609281430+12"),
    );

    expect(chosen?.version).toBe("0.2.1");
  });

  it("publishes whichever manifest exists when the other does not yet", () => {
    const chosen = [
      previewChannelManifest(null, manifest("0.1.1-preview.202609281430+3")),
      previewChannelManifest(manifest("0.1.0"), null),
    ].map((found) => found?.version);

    expect(chosen).toEqual(["0.1.1-preview.202609281430+3", "0.1.0"]);
  });
});
