// @vitest-environment happy-dom
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signatureCheck, packageVersion, signatureProblems } from "./signatures";
import {
  CLI_SIGNATURE,
  SIGNED_FILE,
  TSUZURI_PUBKEY,
  VERSIONED_FILE,
  VERSIONED_PUBKEY,
  VERSIONED_SIGNATURE,
} from "./test_signatures";

const base64 = (text: string) => Buffer.from(text).toString("base64");

/** A key pair signing as `tauri signer sign` does: a BLAKE2b-512 prehash, then the trusted comment. */
function tauriKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = randomBytes(8);
  const x = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const pubkey = base64(
    `untrusted comment: minisign public key\n${Buffer.concat([Buffer.from("Ed"), keyId, x]).toString("base64")}\n`,
  );
  const signFile = (file: Buffer, comment: string) => {
    const hash = createHash("blake2b512").update(file).digest();
    const ed25519 = sign(null, hash, privateKey);
    const global = sign(
      null,
      Buffer.concat([ed25519, Buffer.from(comment)]),
      privateKey,
    );
    const signature = Buffer.concat([Buffer.from("ED"), keyId, ed25519]);
    return base64(
      `untrusted comment: signature from tauri secret key\n${signature.toString("base64")}\ntrusted comment: ${comment}\n${global.toString("base64")}\n`,
    );
  };
  return { pubkey, signFile };
}

describe("updater signatures", () => {
  it("reads a signature the Tauri CLI wrote with Tsuzuri's updater key", () => {
    const check = signatureCheck(TSUZURI_PUBKEY, SIGNED_FILE, CLI_SIGNATURE);

    expect(check).toEqual({
      isKeyMatched: true,
      isFileMatched: true,
      isCommentMatched: true,
      signedVersion: undefined,
    });
  });

  it("reads the release number the Tauri CLI bound a signature to", () => {
    const check = signatureCheck(
      VERSIONED_PUBKEY,
      VERSIONED_FILE,
      VERSIONED_SIGNATURE,
    );

    expect(signatureProblems(check, "0.2.0")).toEqual([]);
  });

  it("refuses a signature bound to no version", () => {
    const check = signatureCheck(TSUZURI_PUBKEY, SIGNED_FILE, CLI_SIGNATURE);

    expect(signatureProblems(check, "0.1.0")).toEqual([
      "bound to no version, not 0.1.0",
    ]);
  });

  it("accepts a signature bound to the release being built", () => {
    const { pubkey, signFile } = tauriKeys();
    const file = Buffer.from("installer");
    const signature = signFile(
      file,
      "timestamp:1\tfile:Tsuzuri.msi\tversion:0.2.0",
    );

    const problems = signatureProblems(
      signatureCheck(pubkey, file, signature),
      "0.2.0",
    );

    expect(problems).toEqual([]);
  });

  it("refuses a signature bound to another release", () => {
    const { pubkey, signFile } = tauriKeys();
    const file = Buffer.from("installer");
    const signature = signFile(file, "timestamp:1\tfile:x\tversion:0.1.0");

    const problems = signatureProblems(
      signatureCheck(pubkey, file, signature),
      "0.2.0",
    );

    expect(problems).toEqual(["bound to 0.1.0, not 0.2.0"]);
  });

  it("refuses a signature made with a key other than the updater key", () => {
    const { signFile } = tauriKeys();
    const signature = signFile(SIGNED_FILE, "timestamp:1\tversion:0.1.0");

    const problems = signatureProblems(
      signatureCheck(TSUZURI_PUBKEY, SIGNED_FILE, signature),
      "0.1.0",
    );

    expect(problems).toEqual([
      "signed with another key",
      "does not match the file",
      "trusted comment altered",
    ]);
  });

  it("refuses a file changed after it was signed", () => {
    const { pubkey, signFile } = tauriKeys();
    const signature = signFile(Buffer.from("installer"), "version:0.1.0");

    const problems = signatureProblems(
      signatureCheck(pubkey, Buffer.from("installer!"), signature),
      "0.1.0",
    );

    expect(problems).toEqual(["does not match the file"]);
  });

  it("refuses a version written into the trusted comment afterwards", () => {
    const { pubkey, signFile } = tauriKeys();
    const file = Buffer.from("installer");
    const original = Buffer.from(
      signFile(file, "timestamp:1\tversion:0.1.0"),
      "base64",
    ).toString("utf8");
    const altered = base64(original.replace("version:0.1.0", "version:0.2.0"));

    const problems = signatureProblems(
      signatureCheck(pubkey, file, altered),
      "0.2.0",
    );

    expect(problems).toEqual(["trusted comment altered"]);
  });

  it("reads the package's version rather than a dependency's", () => {
    const cargoToml = `[package]\nname = "tsuzuri"\nversion = "0.1.0"\n\n[dependencies]\nserde = { version = "1" }\n`;

    expect(packageVersion(cargoToml)).toBe("0.1.0");
  });
});
