// Checks every updater signature a build wrote against Tsuzuri's updater key and the release
// number it must be bound to, so a key pair that does not match is caught before users update.
//   node scripts/signatures.ts <bundle directory>
import { createHash, createPublicKey, verify } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** What one signature proves: signed by the updater key, over this file, for this release. */
export interface SignatureCheck {
  isKeyMatched: boolean;
  isFileMatched: boolean;
  isCommentMatched: boolean;
  signedVersion: string | undefined;
}

/** The lines of a minisign key or signature, which Tauri writes base64 encoded as a whole. */
function minisignLines(base64: string): string[] {
  return Buffer.from(base64.trim(), "base64").toString("utf8").split("\n");
}

/** The trusted comment of `signature`: tab-separated fields the signature covers. */
function trustedComment(signature: string): string {
  return minisignLines(signature)[2].replace(/^trusted comment: /, "");
}

/** The release number the Tauri CLI bound `signature` to, or none for one signed without it. */
export function signedVersion(signature: string): string | undefined {
  return /(?:^|\t)version:([^\t]*)/.exec(trustedComment(signature))?.[1];
}

/**
 * Checks `signature`, as Tauri writes a `.sig`, over `file` with the Tauri public key `pubkey`.
 * A minisign signature holds its algorithm (`ED` signs a BLAKE2b-512 hash of the file, `Ed` the
 * file itself), the key id and the Ed25519 signature, then a trusted comment signed with it.
 */
export function signatureCheck(
  pubkey: string,
  file: Buffer,
  signature: string,
): SignatureCheck {
  const publicKey = Buffer.from(minisignLines(pubkey)[1], "base64");
  const [, signatureLine, , globalLine] = minisignLines(signature);
  const signed = Buffer.from(signatureLine, "base64");
  const comment = trustedComment(signature);
  const key = createPublicKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      x: publicKey.subarray(10, 42).toString("base64url"),
    },
    format: "jwk",
  });
  const isPrehashed = signed.subarray(0, 2).toString() === "ED";
  const message = isPrehashed
    ? createHash("blake2b512").update(file).digest()
    : file;
  const ed25519 = signed.subarray(10, 74);
  return {
    isKeyMatched: publicKey.subarray(2, 10).equals(signed.subarray(2, 10)),
    isFileMatched: verify(null, message, key, ed25519),
    isCommentMatched: verify(
      null,
      Buffer.concat([ed25519, Buffer.from(comment)]),
      key,
      Buffer.from(globalLine, "base64"),
    ),
    signedVersion: signedVersion(signature),
  };
}

/** Why `check` does not prove a release of `version`, or none when it does. */
export function signatureProblems(
  check: SignatureCheck,
  version: string,
): string[] {
  return [
    ...(check.isKeyMatched ? [] : ["signed with another key"]),
    ...(check.isFileMatched ? [] : ["does not match the file"]),
    ...(check.isCommentMatched ? [] : ["trusted comment altered"]),
    ...(check.signedVersion === version
      ? []
      : [`bound to ${check.signedVersion ?? "no version"}, not ${version}`]),
  ];
}

/** The release number Cargo.toml gives the package, which the build signs with. */
export function packageVersion(cargoToml: string): string {
  const version = /^\[package\][^[]*?^version\s*=\s*"([^"]+)"/m.exec(
    cargoToml,
  )?.[1];
  if (!version) throw new Error("Cargo.toml names no package version");
  return version;
}

function signatureFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".sig"))
    .map((path) => join(directory, path));
}

if (import.meta.main) {
  const [bundles] = process.argv.slice(2);
  if (!bundles) {
    console.error("usage: node scripts/signatures.ts <bundle directory>");
    process.exit(2);
  }
  const config = JSON.parse(
    readFileSync("src-tauri/tauri.conf.json", "utf8"),
  ) as { plugins: { updater: { pubkey: string } } };
  const version = packageVersion(readFileSync("src-tauri/Cargo.toml", "utf8"));
  const signatures = signatureFiles(bundles);
  if (signatures.length === 0) {
    console.error(`no updater signature under ${bundles}`);
    process.exit(1);
  }
  let hasProblem = false;
  for (const path of signatures) {
    const problems = signatureProblems(
      signatureCheck(
        config.plugins.updater.pubkey,
        readFileSync(path.slice(0, -".sig".length)),
        readFileSync(path, "utf8"),
      ),
      version,
    );
    console.log(`${path}: ${problems.length ? problems.join("; ") : "ok"}`);
    hasProblem ||= problems.length > 0;
  }
  if (hasProblem) process.exit(1);
}
