# OpenCC dictionaries

The tables Simplified Cleanup reads, copied unmodified from OpenCC and compiled into Tsuzuri by `include_str!` in `src/cleanup.rs`.

| Item | Value |
|---|---|
| Project | [OpenCC](https://github.com/BYVoid/OpenCC) by BYVoid and contributors |
| License | Apache-2.0, see `LICENSE` |
| Release | `ver.1.4.2` (commit `025f371d`) |
| Source | `data/dictionary/` of that release |

| File | SHA-256 |
|---|---|
| `STPhrases.txt` | `f6eab5e5c6dd7640597878d3dfc6599ee1279d2bc91561eadd8e114194e2925a` |
| `STCharacters.txt` | `a0ca1601c70648cf48b33c3c6210ccbecc5c7eead4b4c3daf76587ba2c03582b` |
| `TWVariants.txt` | `e187278e119c427ca561180ac5da5b20e9f8681190458f35c327ce499e95a6a5` |
| `LICENSE` | `b534e465949558eec2597b04f5092b5e161236a68dfbfd04d547592ac3964308` |

## How Tsuzuri uses them

The files stay as OpenCC ships them; Tsuzuri reads them differently from OpenCC's `s2twp` in these ways:

| Difference | Why |
|---|---|
| Only the first candidate | one Traditional form each |
| A character listing itself is not converted alone | it is Traditional too |
| 台 kept where a phrase writes 臺 | Taiwan writes both |
| No `TWPhrases*.txt` | words stay as said |

## Updating

Copy the three dictionaries and `LICENSE` from a newer release tag, then update the release and hashes above and the notice in `about.hbs`.
