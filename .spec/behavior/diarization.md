# Diarization

Speaker Diarization: telling from a media file who is heard when, and giving each Segment of its Transcript the Speaker heard longest during it.

## Includes

- `src-tauri/src/diarization.rs`
- `src-tauri/src/diarization/*.rs`

## `DZ-001` Giving a Segment the Speaker heard longest during it

| Step | Statement |
| --- | --- |
| Given | a Segment from 0 s to 4 s and Speaker Turns of `Speaker 1` from 0 s to 1 s and `Speaker 2` from 1 s to 4 s |
| When | Speakers are given to the Segments |
| Then | the Segment's Speaker is `Speaker 2` |

## `DZ-002` Leaving a Segment nobody is heard during without a Speaker

| Step | Statement |
| --- | --- |
| Given | a Segment from 5 s to 6 s and a Speaker Turn of `Speaker 1` from 0 s to 4 s |
| When | Speakers are given to the Segments |
| Then | the Segment has no Speaker |

## `DZ-003` Numbering Speakers in the order they are first heard

| Step | Statement |
| --- | --- |
| Given | the diarization Model's first and second speaker channels |
| When | they are named |
| Then | they are `Speaker 1` and `Speaker 2` |

## `DZ-004` Refusing a Model that is not Nemotron-3 Diarization

| Step | Statement |
| --- | --- |
| Given | a GGUF file whose architecture is not Sortformer v3 |
| When | it is loaded as the diarization Model |
| Then | it is refused, naming the architecture it found |
