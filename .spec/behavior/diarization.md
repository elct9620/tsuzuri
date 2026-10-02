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

## `DZ-005` Reporting how far a diarization has come

| Step | Statement |
| --- | --- |
| Given | the diarize Step having run two of a recording's four chunks |
| When | its progress line is read back |
| Then | it reads as 50 % |

## `DZ-006` Failing a diarize Step whose Model cannot be loaded

| Step | Statement |
| --- | --- |
| Given | a diarization Model path where no file is |
| When | the diarize Step runs |
| Then | it exits with code 1 and says why on stderr |

## `DZ-007` Writing the Speakers a diarization finds

| Step | Statement |
| --- | --- |
| Given | a Resource whose subtitle has Segments at 0 s and 4 s, and a diarize Step hearing `Speaker 1` during the first and `Speaker 2` during the second |
| When | it is diarized |
| Then | its subtitle gives the first Segment `Speaker 1` and the second `Speaker 2` |

## `DZ-008` Backing up the subtitle a diarization writes

| Step | Statement |
| --- | --- |
| Given | a Resource with a subtitle, in a Project keeping a Backup before a Mode overwrites one |
| When | it is diarized |
| Then | a Backup keeps the subtitle as it was |

## `DZ-009` Giving the translations the Speakers diarized

| Step | Statement |
| --- | --- |
| Given | a Resource with an English translation of its Segments |
| When | it is diarized |
| Then | each cue of the English translation carries its Segment's Speaker |

## `DZ-010` Reporting diarization progress

| Step | Statement |
| --- | --- |
| Given | a diarize Step reporting 50 % and 100 % |
| When | a Resource is diarized |
| Then | a progress event carries each percentage it reported |

## `DZ-011` Converting the whole media file for a diarization

| Step | Statement |
| --- | --- |
| Given | a Resource with a media file |
| When | it is diarized |
| Then | ffmpeg converts the whole media file to 16 kHz mono WAV |

## `DZ-012` Holding the Resource while it is diarized

| Step | Statement |
| --- | --- |
| Given | a Resource being diarized |
| When | the Project is viewed |
| Then | it is held by a diarization |

## `DZ-013` Refusing to diarize without a diarization Model

| Step | Statement |
| --- | --- |
| Given | no Model chosen for the diarization slot |
| When | a Resource is diarized |
| Then | it is refused as not chosen before any Step runs |

## `DZ-014` Refusing to diarize a Resource without a subtitle

| Step | Statement |
| --- | --- |
| Given | a Resource with a media file and no Primary Language subtitle |
| When | it is diarized |
| Then | it is refused before any Step runs |

