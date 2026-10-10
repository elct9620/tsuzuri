# Taggers

The seam a Language plugs its word tagger into, so Glossary Mark candidates reach another Language by adding a tagger rather than changing the marks.

## Includes

- `src-tauri/src/proper_nouns.rs`

## `ProperNounTagger`

Finds the proper nouns of one Language.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait ProperNounTagger {}
```

## `ProperNounTagger::proper_nouns`

The byte ranges of a line naming a person, a place, an organisation or another name, two characters or more each.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait ProperNounTagger {
    fn proper_nouns(&self, text: &str) -> Vec<Range<usize>>;
}
```

## `tagger_by_language`

The tagger of a Language, or none for a Language Tsuzuri cannot tag word by word.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub fn tagger_by_language(language: Language) -> Option<&'static dyn ProperNounTagger> {}
```
