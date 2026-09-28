// @vitest-environment happy-dom
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signatureCheck, packageVersion, signatureProblems } from "./signatures";

/** Tsuzuri's updater key, as tauri.conf.json carries it. */
const TSUZURI_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEM4MTU3MkMxNDdFOUYwOTEKUldTUjhPbEh3WElWeUtadTI3N3BBaCt5VTM5dmtKVnJqYTZWeHVHMDdwWUZOdjhwN1M3WHhoNEYK";

/** A file `tauri signer sign` signed with Tsuzuri's updater key, bound to no version. */
const SIGNED_FILE = Buffer.from("tsuzuri updater key check\n");
const CLI_SIGNATURE =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTUjhPbEh3WElWeUVtSlNhemVoR0s4RXdUbnlINGtvTUlOZlQvV0FNelphT2JTNmlRTnQrM3RjNkRqS1YrWC9CWVFWTTk1bTRmWkhBb1ZVUnZVR0pDL3pyTXJCNTB6UEFBPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwNTc2NDA3CWZpbGU6c2FtcGxlLnR4dApkUlFnTVdOUWhZQlZOTVc4WXhJb2lGSWJHbWV3UitLZ3lXRTM2ZjBwbmNSM25ibmlEeXErRmZVQkJHWEVSUjFudzN6MVgvMG1OU0dpcEtjenpqYitCdz09Cg==";

/** A file `tauri signer sign --app-version 0.2.0` signed with a key made for this test. */
const VERSIONED_FILE = Buffer.from("Tsuzuri installer\n");
const VERSIONED_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEEyRkE5RjVEMzhDNkZFRkEKUldUNi9zWTRYWi82b3VCVFlYazlVQ2dqNDB1TXhjR2huZGp5aDdPRlVZM3RyMENxemlVMjA1Y0EK";
const VERSIONED_SIGNATURE =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUNi9zWTRYWi82b3VrVFVUaVNxWTFycGlkRmZFVE5qUUhseU50QUhOamlXOFh6bmJsSzhUMmZuQ2FjdzdEdDdsUm90UnlSWjl0VWxTSENQVWg3MmVRV2p5RjVDL1JDNlFjPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwNTc4NTE3CWZpbGU6VHN1enVyaS5tc2kJdmVyc2lvbjowLjIuMApxVGNzTG5QY0owbnBtSlZBSkVISUZRcERTdDlEU09oRXZMU0NTL3Z2Nm9qWUlIdDllT2t3MFVYc29NZWV3MkJCWjRzU01MVzhwcHZuWEVXRzduSm9CUT09Cg==";

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
