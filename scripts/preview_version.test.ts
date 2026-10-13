// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  previewChanges,
  previewReleasePage,
  previewTag,
  previewVersion,
  type ReleaseReader,
  withPackageVersion,
} from "./preview_version";
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

  it("tags a Preview build by its release number without the count only MSI reads", () => {
    expect(previewTag("0.2.1-preview.202609281430+12")).toBe(
      "v0.2.1-preview.202609281430",
    );
  });

  it("names the Preview release by its Release Name, as the settings do, never its release number", () => {
    expect(
      previewReleasePage("0.2.1-preview.202609281430+12", "a1b2c3d4e5f6"),
    ).toEqual({
      title: "Preview Build 20260928+12",
      notes: [
        "A Preview build of main, for testing. Not a stable release.",
        "",
        "- Built: 2026-09-28 14:30 UTC",
        "- Commit: a1b2c3d",
      ].join("\n"),
    });
  });

  describe("the changes since the previous Preview build", () => {
    const previous = {
      name: "Preview Build 20260928+11",
      commit: "0a0b0c0d0e0f",
    };
    const commits = [
      { sha: "1111111aaaa", message: "fix(editor): keep the caret\n\nWhy." },
      { sha: "2222222bbbb", message: "refactor(editor): name the rows" },
    ];

    it("lists every commit since the previous build, oldest first, with a comparison of the two", () => {
      const { notes } = previewReleasePage(
        "0.2.1-preview.202609281430+12",
        "a1b2c3d4e5f6",
        { repository: "elct9620/tsuzuri", previous, commits, total: 2 },
      );

      expect(notes.split("\n").slice(5)).toEqual([
        "## Changes since Preview Build 20260928+11 (0a0b0c0)",
        "",
        "- 1111111 fix(editor): keep the caret",
        "- 2222222 refactor(editor): name the rows",
        "",
        "Compare: https://github.com/elct9620/tsuzuri/compare/0a0b0c0d0e0f...a1b2c3d4e5f6",
      ]);
    });

    it("says how many commits the list leaves out past what the comparison returns", () => {
      const { notes } = previewReleasePage(
        "0.2.1-preview.202609281430+12",
        "a1b2c3d4e5f6",
        { repository: "elct9620/tsuzuri", previous, commits, total: 300 },
      );

      expect(notes).toContain(
        "- 2222222 refactor(editor): name the rows\n- and 298 more in the comparison",
      );
    });
  });

  describe("finding the previous Preview build", () => {
    /** A Preview release of the build at `built` made from `commit`. */
    const preview = (built: string, commit: string, count: number) => ({
      tag_name: `v0.2.1-preview.${built}`,
      name: `Preview Build ${built.slice(0, 8)}+${count}`,
      target_commitish: commit,
      draft: false,
      prerelease: true,
    });
    const releases = [
      { ...preview("202609281515", "c4", 15), draft: true },
      preview("202609281500", "c3", 14),
      preview("202609281430", "c2", 12),
      preview("202609281400", "c1", 11),
      {
        tag_name: "v0.2.0",
        name: "v0.2.0",
        target_commitish: "c0",
        draft: false,
        prerelease: false,
      },
    ];
    /** The base each comparison was asked from. */
    let comparedBases: string[];
    const github: ReleaseReader = {
      rest: {
        repos: {
          listReleases: async () => ({ data: releases }),
          compareCommits: async ({ base }) => {
            comparedBases.push(base);
            return {
              data: {
                total_commits: 1,
                commits: [{ sha: "d4", commit: { message: "fix: it" } }],
              },
            };
          },
        },
      },
    };

    beforeEach(() => {
      comparedBases = [];
    });

    it("compares a build with the newest Preview build made before it", async () => {
      const changes = await previewChanges(
        github,
        "elct9620/tsuzuri",
        "0.2.1-preview.202609281445+13",
        "d4",
      );

      expect([changes?.previous, changes?.commits, comparedBases]).toEqual([
        { name: "Preview Build 20260928+12", commit: "c2" },
        [{ sha: "d4", message: "fix: it" }],
        ["c2"],
      ]);
    });

    it("compares a rerun of an older build with the build before it, never a later one", async () => {
      const changes = await previewChanges(
        github,
        "elct9620/tsuzuri",
        "0.2.1-preview.202609281430+12",
        "c2",
      );

      expect(changes?.previous.name).toBe("Preview Build 20260928+11");
    });

    it("passes over a Preview build of the same commit", async () => {
      const changes = await previewChanges(
        github,
        "elct9620/tsuzuri",
        "0.2.1-preview.202609281445+13",
        "c2",
      );

      expect(changes?.previous.name).toBe("Preview Build 20260928+11");
    });

    it("finds no changes for the first Preview build", async () => {
      const changes = await previewChanges(
        github,
        "elct9620/tsuzuri",
        "0.2.1-preview.202609281300+10",
        "b0",
      );

      expect([changes, comparedBases]).toEqual([null, []]);
    });
  });

  it("refuses to name a release that is no Preview build", () => {
    expect(() => previewReleasePage("0.2.0", "a1b2c3d")).toThrow(
      "0.2.0 is not a Preview build",
    );
  });
});
