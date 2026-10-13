// Numbers a Preview build and writes the number into Cargo.toml, which the build and its updater
// signatures read; the number is never committed, so merging the trunk into main stays clean.
//   node scripts/preview_version.ts next <UTC YYYYMMDDHHmm> <run number> [latest stable tag]
//   node scripts/preview_version.ts write <version>
//   node scripts/preview_version.ts tag <version>
//   node scripts/preview_version.ts release <version> <commit> [changes.json]   (the Preview release's title and notes)
// `actions/github-script` imports `previewChanges`, which reads the changes.json data through its
// GitHub client.
import { readFileSync, writeFileSync } from "node:fs";
import { packageVersion } from "./signatures.ts";

/** The MSI installer keeps the build count in a field that holds at most this. */
const LARGEST_MSI_FIELD = 65535;

/**
 * The release number of a Preview build: the patch after the latest stable release (or after
 * `packageVersion` before any release exists), `-preview.` and its UTC build time, which orders
 * Preview builds, and `+` the run number, which only the MSI installer reads.
 */
export function previewVersion(
  latestStable: string | null,
  packageVersionNow: string,
  builtAt: string,
  run: number,
): string {
  if (!/^\d{12}$/.test(builtAt))
    throw new Error(`build time ${builtAt} is not YYYYMMDDHHmm`);
  if (!Number.isInteger(run) || run < 0 || run > LARGEST_MSI_FIELD)
    throw new Error(`run ${run} does not fit the MSI build field`);
  const base = (latestStable ?? packageVersionNow).replace(/^v/, "");
  const [major, minor, patch] = base.split(/[.+-]/).map(Number);
  return `${major}.${minor}.${patch + 1}-preview.${builtAt}+${run}`;
}

/**
 * The tag of the Preview build `version` numbers: its release number without the `+` count only
 * the MSI installer reads, which GitHub would rewrite in a download address.
 */
export function previewTag(version: string): string {
  return `v${version.split("+")[0]}`;
}

/** What a Preview build holds since the previous one, as GitHub compares their commits. */
export interface PreviewChanges {
  /** The repository as `owner/name`. */
  repository: string;
  /** The previous Preview build's release name and commit. */
  previous: { name: string; commit: string };
  /** The commits since the previous build, oldest first, as many as the comparison returns. */
  commits: { sha: string; message: string }[];
  /** How many commits there are since the previous build, listed or not. */
  total: number;
}

/** A release as GitHub lists it. */
interface ListedRelease {
  tag_name: string;
  name: string | null;
  target_commitish: string;
  draft: boolean;
  prerelease: boolean;
}

/** The part of the GitHub client `actions/github-script` hands a script that reads releases and comparisons. */
export interface ReleaseReader {
  rest: {
    repos: {
      listReleases(params: {
        owner: string;
        repo: string;
        per_page: number;
      }): Promise<{ data: ListedRelease[] }>;
      compareCommits(params: {
        owner: string;
        repo: string;
        base: string;
        head: string;
      }): Promise<{
        data: {
          total_commits: number;
          commits: { sha: string; commit: { message: string } }[];
        };
      }>;
    };
  };
}

/** The UTC build time, as `YYYYMMDDHHmm`, in a Preview build's release number or tag. */
function buildTime(versionOrTag: string): string | null {
  return /-preview\.(\d{12})(?:\+\d+)?$/.exec(versionOrTag)?.[1] ?? null;
}

/**
 * The changes since the newest Preview build made before the build `version` numbers, from
 * another commit, or none before the first. Build times come from the tags, so a rerun of an
 * older build compares with the same build it did the first time.
 */
export async function previewChanges(
  github: ReleaseReader,
  repository: string,
  version: string,
  commit: string,
): Promise<PreviewChanges | null> {
  const [owner, repo] = repository.split("/");
  const built = buildTime(version);
  const { data: releases } = await github.rest.repos.listReleases({
    owner,
    repo,
    per_page: 100,
  });
  const previous = releases
    .filter(
      (release) =>
        release.prerelease &&
        !release.draft &&
        release.target_commitish !== commit,
    )
    .flatMap((release) => {
      const releaseBuilt = buildTime(release.tag_name);
      return releaseBuilt && built && releaseBuilt < built
        ? [{ release, built: releaseBuilt }]
        : [];
    })
    .sort((a, b) => b.built.localeCompare(a.built))[0]?.release;
  if (!previous) return null;
  const { data } = await github.rest.repos.compareCommits({
    owner,
    repo,
    base: previous.target_commitish,
    head: commit,
  });
  return {
    repository,
    previous: {
      name: previous.name ?? previous.tag_name,
      commit: previous.target_commitish,
    },
    commits: data.commits.map(({ sha, commit: { message } }) => ({
      sha,
      message,
    })),
    total: data.total_commits,
  };
}

/** A commit's abbreviated hash, as git shows it. */
const shortSha = (sha: string) => sha.slice(0, 7);

/**
 * The section listing every commit since the previous build, so a problem a tester finds in this
 * build and not the previous one lies among them.
 */
function changesSection(commit: string, changes: PreviewChanges): string[] {
  const { repository, previous, commits, total } = changes;
  const unlisted = total - commits.length;
  return [
    `## Changes since ${previous.name} (${shortSha(previous.commit)})`,
    "",
    ...commits.map(
      ({ sha, message }) => `- ${shortSha(sha)} ${message.split("\n")[0]}`,
    ),
    ...(unlisted > 0 ? [`- and ${unlisted} more in the comparison`] : []),
    "",
    `Compare: https://github.com/${repository}/compare/${previous.commit}...${commit}`,
  ];
}

/**
 * The title and notes of the Preview release for the build `version` numbers, naming it by its
 * Release Name as the settings do — `Build`, its UTC build date and `+` its build count — since
 * its release number only orders it; with `changes`, the notes list the commits since the
 * previous build.
 */
export function previewReleasePage(
  version: string,
  commit: string,
  changes?: PreviewChanges,
): { title: string; notes: string } {
  const match = /^\d+\.\d+\.\d+-preview\.(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\+(\d+)$/.exec(
    version,
  );
  if (!match) throw new Error(`${version} is not a Preview build`);
  const [, year, month, day, hour, minute, count] = match;
  return {
    title: `Preview Build ${year}${month}${day}+${count}`,
    notes: [
      "A Preview build of main, for testing. Not a stable release.",
      "",
      `- Built: ${year}-${month}-${day} ${hour}:${minute} UTC`,
      `- Commit: ${shortSha(commit)}`,
      ...(changes ? ["", ...changesSection(commit, changes)] : []),
    ].join("\n"),
  };
}

/** `cargoToml` with its package version replaced by `version`, the dependencies left as they are. */
export function withPackageVersion(cargoToml: string, version: string): string {
  return cargoToml.replace(
    /^(\[package\][^[]*?^version\s*=\s*")[^"]+(")/m,
    (_, before: string, after: string) => `${before}${version}${after}`,
  );
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2);
  const cargoPath = "src-tauri/Cargo.toml";
  const cargoToml = readFileSync(cargoPath, "utf8");
  if (command === "next") {
    const [builtAt, run, latestStable] = args;
    console.log(
      previewVersion(
        latestStable || null,
        packageVersion(cargoToml),
        builtAt,
        Number(run),
      ),
    );
  } else if (command === "write") {
    writeFileSync(cargoPath, withPackageVersion(cargoToml, args[0]));
  } else if (command === "tag") {
    console.log(previewTag(args[0]));
  } else if (command === "release") {
    const [version, commit, changesPath] = args;
    const changes = changesPath
      ? (JSON.parse(readFileSync(changesPath, "utf8")) as PreviewChanges)
      : undefined;
    console.log(JSON.stringify(previewReleasePage(version, commit, changes)));
  } else {
    console.error(
      "usage: node scripts/preview_version.ts next <YYYYMMDDHHmm> <run> [latest tag] | write <version> | tag <version> | release <version> <commit> [changes.json]",
    );
    process.exit(2);
  }
}
