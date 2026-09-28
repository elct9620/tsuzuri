/** Signatures the Tauri CLI wrote, for the scripts that read them. */

/** Tsuzuri's updater key, as tauri.conf.json carries it. */
export const TSUZURI_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEM4MTU3MkMxNDdFOUYwOTEKUldTUjhPbEh3WElWeUtadTI3N3BBaCt5VTM5dmtKVnJqYTZWeHVHMDdwWUZOdjhwN1M3WHhoNEYK";

/** A file `tauri signer sign` signed with Tsuzuri's updater key, bound to no version. */
export const SIGNED_FILE = Buffer.from("tsuzuri updater key check\n");
export const CLI_SIGNATURE =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTUjhPbEh3WElWeUVtSlNhemVoR0s4RXdUbnlINGtvTUlOZlQvV0FNelphT2JTNmlRTnQrM3RjNkRqS1YrWC9CWVFWTTk1bTRmWkhBb1ZVUnZVR0pDL3pyTXJCNTB6UEFBPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwNTc2NDA3CWZpbGU6c2FtcGxlLnR4dApkUlFnTVdOUWhZQlZOTVc4WXhJb2lGSWJHbWV3UitLZ3lXRTM2ZjBwbmNSM25ibmlEeXErRmZVQkJHWEVSUjFudzN6MVgvMG1OU0dpcEtjenpqYitCdz09Cg==";

/** A file `tauri signer sign --app-version 0.2.0` signed with a key made for these tests. */
export const VERSIONED_FILE = Buffer.from("Tsuzuri installer\n");
export const VERSIONED_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEEyRkE5RjVEMzhDNkZFRkEKUldUNi9zWTRYWi82b3VCVFlYazlVQ2dqNDB1TXhjR2huZGp5aDdPRlVZM3RyMENxemlVMjA1Y0EK";
export const VERSIONED_SIGNATURE =
  "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVUNi9zWTRYWi82b3VrVFVUaVNxWTFycGlkRmZFVE5qUUhseU50QUhOamlXOFh6bmJsSzhUMmZuQ2FjdzdEdDdsUm90UnlSWjl0VWxTSENQVWg3MmVRV2p5RjVDL1JDNlFjPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkwNTc4NTE3CWZpbGU6VHN1enVyaS5tc2kJdmVyc2lvbjowLjIuMApxVGNzTG5QY0owbnBtSlZBSkVISUZRcERTdDlEU09oRXZMU0NTL3Z2Nm9qWUlIdDllT2t3MFVYc29NZWV3MkJCWjRzU01MVzhwcHZuWEVXRzduSm9CUT09Cg==";
