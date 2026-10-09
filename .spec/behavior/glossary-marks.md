# Glossary Marks

Underlining in the editor where the Translation Glossary's terms are written, in a Segment's text and in the translation shown, so a proofreader sees which names it already covers.

## Includes

- `src-tauri/src/project/glossary_marks.rs`

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
