# Glossary Marks

Underlining in the editor where the Translation Glossary's terms are written, in a Segment's text and in the translation shown, and the proper nouns of the text it does not have yet, so a proofreader sees which names it already covers and which it lacks.

## Includes

- `src-tauri/src/project/glossary_marks.rs`
- `src-tauri/src/proper_nouns.rs`
- `src/components/glossary-marks.test.ts`

## `GM-001` Marking a term in the text

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` is `zh-TW,en` with the row `蝙蝠俠,Batman` |
| Given | a Segment reading `今天蝙蝠俠來了` |
| When | the Project is shown |
| Then | the Segment's text has the term `蝙蝠俠` marked from 2 to 5 |

## `GM-002` Marking a term in the translation shown whatever its case

A translation is checked for a term's word ignoring case, so it is marked the same way.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` is `zh-TW,en` with the row `蝙蝠俠,Batman` |
| Given | a Segment translated into `en` as `BATMAN is here`, its translation shown |
| When | the Project is shown |
| Then | the translation has the term `BATMAN` marked from 0 to 6 |

## `GM-003` Marking a term with no word in another Language

A term just added has only its Primary Language word, and is marked as the Translation Glossary's all the same.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` is `zh-TW,en` with the row `阿福,` |
| Given | a Segment reading `阿福來了` |
| When | the Project is shown |
| Then | the Segment's text has the term `阿福` marked from 0 to 2 |

## `GM-004` Marking the longer of two overlapping terms

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` is `zh-TW,en` with the rows `蝙蝠,Bat` and `蝙蝠俠,Batman` |
| Given | a Segment reading `蝙蝠俠來了` |
| When | the Project is shown |
| Then | the Segment's text has only the term `蝙蝠俠` marked, from 0 to 3 |

## `GM-005` Counting a mark in UTF-16 units

The webview counts text in UTF-16 units, where a character beyond the Basic Multilingual Plane takes two.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` is `zh-TW,en` with the row `蝙蝠俠,Batman` |
| Given | a Segment reading `𠮷蝙蝠俠` |
| When | the Project is shown |
| Then | the Segment's text has the term `蝙蝠俠` marked from 2 to 5 |

## `GM-006` Marking proper nouns as candidates

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` without `glossary.csv` |
| Given | a Segment reading `小林先生明天要去京都` |
| When | the Project is shown |
| Then | the Segment's text has the candidates `小林` from 0 to 2 and `京都` from 8 to 10 |

## `GM-007` Tagging Taiwan's Traditional characters

jieba's dictionary is Simplified, so each character is read in its Simplified form, which keeps every word where it stands.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` without `glossary.csv` |
| Given | a Segment reading `今天我們在臺北見到了周杰倫` |
| When | the Project is shown |
| Then | the Segment's text has the candidates `臺北` from 5 to 7 and `周杰倫` from 10 to 13 |

## `GM-008` Leaving a term out of the candidates

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` whose `glossary.csv` is `zh-TW,en` with the row `京都,Kyoto` |
| Given | a Segment reading `小林先生明天要去京都` |
| When | the Project is shown |
| Then | the Segment's text has the candidate `小林` and the term `京都` |

## `GM-009` Leaving out a proper noun of one character

A single character tagged as a name is more often a misreading than a name.

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` without `glossary.csv` |
| Given | a Segment reading `王小明和李大華一起去高雄`, where `李` alone is tagged as a name |
| When | the Project is shown |
| Then | no mark of the Segment's text is one character long |

## `GM-010` Finding no candidates in a Language without a tagger

| Step | Statement |
| --- | --- |
| Given | a Project in `ja` without `glossary.csv` |
| Given | a Segment reading `小林さんは京都へ行きます` |
| When | the Project is shown |
| Then | the Segment has no Glossary Marks |

## `GM-011` Finding no candidates in a translation

| Step | Statement |
| --- | --- |
| Given | a Project in `en` without `glossary.csv` |
| Given | a Segment translated into `zh-TW` as `小林先生明天要去京都`, its translation shown |
| When | the Project is shown |
| Then | the translation has no Glossary Marks |

## `GM-012` Underlining the terms and the candidates in their fields

| Step | Statement |
| --- | --- |
| Given | a Segment reading `小林先生明天要去京都` with the candidate `小林` and the term `京都`, translated as `Kobayashi goes to Kyoto` with the term `Kyoto`, its translation shown |
| When | its row is drawn |
| Then | `京都` and `Kyoto` are underlined as terms and `小林` as a candidate |

## `GM-013` Leaving the marks out of a field typed in since they were found

A mark counts characters of the text it was found in, and would land on other words in a text since changed.

| Step | Statement |
| --- | --- |
| Given | the row of a Segment reading `小林先生明天要去京都` with the candidate `小林` |
| Given | its text field typed in to read `小林先生` |
| When | the Project is shown again |
| Then | nothing in the field is underlined as a candidate |
