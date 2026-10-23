# Scripts

What fixes the script API a user's Script is written against: the version it declares and the Snapshot it reads.

## Includes

- `src-tauri/src/script.rs`
- `src-tauri/src/script/*.rs`

## `ApiVersion::declared_in`

The script API version a Script's source declares with `# tsuzuri-api: <major>.<minor>` among the comments and blank lines it opens with, the app's current version when it declares none, or a failure naming a declaration that is not two numbers.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl ApiVersion {
    pub fn declared_in(source: &str) -> Result<ApiVersion, ScriptFailure> {}
}
```

## `ApiVersion::is_loadable`

Whether a Script declaring this version runs in this app: the same major version and a minor version no newer than the app's.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl ApiVersion {
    pub fn is_loadable(self) -> bool {}
}
```

## `Snapshot::new`

The Snapshot of a Resource from its Primary Language Segments and, for each translation Language, the text lined up with each Segment, none where no cue does. A blank text counts as none. Serialized, it is what a Script's `Tsuzuri::Snapshot` is made from: `primary`, `languages` with the Primary Language first, `segments` each with `start_ms`, `end_ms`, `speaker` and `texts` keyed by language code, and `checked_segments` as positions in `segments`, which a Script reads as `checked`.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Snapshot {
    pub fn new(primary: Language, original: &[Segment], translations: Vec<(Language, Vec<Option<String>>)>, checked_segments: Vec<usize>) -> Snapshot {}
}
```
