# Transcript

Reading and writing a Transcript as SRT, the one format every Mode shares: whisper-cli writes it, Translate reads a user's existing file, and the result is saved as it.

## Includes

- `src-tauri/src/transcript.rs`

## `TR-001` Reading an SRT file

| Step | Statement |
| --- | --- |
| Given | an SRT file with two cues |
| When | it is parsed into a Transcript |
| Then | the Transcript holds two Segments with each cue's start, end and text |

## `TR-002` Keeping multi-line cue text

| Step | Statement |
| --- | --- |
| Given | an SRT cue whose text spans two lines |
| When | it is parsed into a Transcript |
| Then | the Segment's text keeps both lines joined by a newline |

## `TR-003` Reading a file saved on Windows

| Step | Statement |
| --- | --- |
| Given | an SRT file with a UTF-8 byte order mark and CRLF line endings |
| When | it is parsed into a Transcript |
| Then | the Segments are the same as for the file without them |

## `TR-004` Rejecting a malformed timestamp

| Step | Statement |
| --- | --- |
| Given | an SRT file whose second cue has an unreadable timing line |
| When | it is parsed into a Transcript |
| Then | parsing fails with an error naming the second cue |

## `TR-005` Writing a Transcript as SRT

| Step | Statement |
| --- | --- |
| Given | a Transcript of two Segments |
| When | it is written as SRT |
| Then | the output numbers the cues from 1 with `HH:MM:SS,mmm` timings and a blank line between cues |

## `TR-006` Writing edited text that contains a blank line

| Step | Statement |
| --- | --- |
| Given | a Segment whose text contains a blank line |
| When | the Transcript is written as SRT and read back |
| Then | it reads back as the same number of Segments |

## `TR-007` Writing the translation as SRT

| Step | Statement |
| --- | --- |
| Given | a Transcript whose Segments carry translations |
| When | the translation is written as SRT |
| Then | each cue carries its Segment's translation in place of the original text |

## `TR-008` Writing a Bilingual SRT

| Step | Statement |
| --- | --- |
| Given | a Transcript of one translated Segment and one without a translation |
| When | it is written as a Bilingual SRT |
| Then | the first cue carries the original above the translation and the second the original alone |

## `TR-009` Reading the Speaker of a cue

| Step | Statement |
| --- | --- |
| Given | an SRT whose cue reads `co: 你好` |
| When | it is read |
| Then | its Segment is said by `co` with the text `你好` |

## `TR-010` Keeping the labels of a cue with several Speakers

| Step | Statement |
| --- | --- |
| Given | an SRT whose cue reads `co: 你好` above `cl: 嗨` |
| When | it is read |
| Then | its Segment has no Speaker and keeps both lines as written |

## `TR-011` Writing the Speaker before the text

| Step | Statement |
| --- | --- |
| Given | a Transcript of a Segment said by `co` with the text `你好` |
| When | it is written as SRT |
| Then | its cue reads `co: 你好` |

## `TR-012` Writing the Speaker before both texts of a Bilingual SRT

| Step | Statement |
| --- | --- |
| Given | a Transcript of a Segment said by `co`, `你好` translated as `Hello` |
| When | it is written as a Bilingual SRT |
| Then | its cue reads `co: 你好` above `co: Hello` |
