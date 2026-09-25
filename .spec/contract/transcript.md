# Transcript

The seam every Mode goes through to read and write subtitles, kept to one implementation so whisper output, user files and saved results agree.

## Includes

- `src-tauri/src/transcript.rs`

## `Transcript::from_srt`

Parse SRT text into a Transcript.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Transcript {
    pub fn from_srt(input: &str) -> Result<Transcript, SrtError> {}
}
```

## `Transcript::to_srt`

Write a Transcript as SRT text carrying the original, the translation, or both as a Bilingual SRT.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Transcript {
    pub fn to_srt(&self, content: SrtContent) -> String {}
}
```

## `Transcript::to_srt_with`

Write a Transcript as `to_srt` does, naming each Speaker in a cue's text and in its translation as `names` gives it; a name `names` does not list stays as the Segment holds it.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Transcript {
    pub fn to_srt_with(&self, content: SrtContent, names: &SpeakerNames) -> String {}
}
```

