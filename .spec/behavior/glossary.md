# Glossary

Editing the Project's Translation Glossary as a table in its own dialog, opened from the Resource list: one column per Language, one row per term, written back to `glossary.csv` with a header of Language codes, and created there when the Project has none.

## Includes

- `src-tauri/src/translation_glossary.rs`
- `src-tauri/src/project.rs`
- `src/controllers/glossary_controller.test.ts`
- `src/controllers/project_controller.test.ts`

## `GL-001` Laying out the Translation Glossary as a table

| Step | Statement |
| --- | --- |
| Given | a Project whose `glossary.csv` is `zh-TW,en` with the row `蝙蝠俠,Batman` |
| When | its table is asked |
| Then | it has the columns `zh-TW`, `en` and `ja` and the row `蝙蝠俠`, `Batman`, empty |

## `GL-002` Creating `glossary.csv` from the table

| Step | Statement |
| --- | --- |
| Given | a Project without `glossary.csv` |
| When | a table with the row `蝙蝠俠`, `Batman`, empty is saved |
| Then | `glossary.csv` holds the header `zh-TW,en,ja` and the row `蝙蝠俠,Batman,` |

## `GL-003` Writing Language codes over a `source,target` header

| Step | Statement |
| --- | --- |
| Given | a Project in `zh-TW` last translated into `en` whose `glossary.csv` is `source,target` with the row `蝙蝠俠,Batman` |
| When | its table is saved as it is |
| Then | `glossary.csv` holds the header `zh-TW,en,ja` and the row `蝙蝠俠,Batman,` |

## `GL-004` Leaving out an empty row when saving

| Step | Statement |
| --- | --- |
| Given | a Project without `glossary.csv` |
| When | a table with an empty row and the row `阿福`, `Alfred`, empty is saved |
| Then | `glossary.csv` holds only the row `阿福,Alfred,` |

## `GL-005` Holding the saved Translation Glossary in the Project

| Step | Statement |
| --- | --- |
| Given | a Project without `glossary.csv` |
| When | a table with one term is saved |
| Then | the Project holds `glossary.csv` with one term |

## `GL-006` Offering to create a Translation Glossary

| Step | Statement |
| --- | --- |
| Given | a Project without `glossary.csv` |
| When | the Resource list shows it |
| Then | it offers to create a Translation Glossary |

## `GL-007` Editing the terms in the dialog

| Step | Statement |
| --- | --- |
| Given | a Translation Glossary with the row `蝙蝠俠`, `Batman`, empty |
| When | its dialog opens |
| Then | each Language is a column and each term a row of fields holding its words |

## `GL-008` Saving the rows of the dialog

| Step | Statement |
| --- | --- |
| Given | the glossary dialog with a row added and filled with `阿福`, `Alfred`, empty |
| When | it is saved |
| Then | the rows are sent to be saved, with `阿福`, `Alfred`, empty last |

## `GL-009` Warning a `source,target` header will be rewritten

| Step | Statement |
| --- | --- |
| Given | a Translation Glossary read from a `source,target` header |
| When | its dialog opens |
| Then | it warns the header will be written as Language codes |

## `GL-010` Keeping an unreadable Translation Glossary from being saved over

An empty table saved over a file that could not be read would lose every term in it.

| Step | Statement |
| --- | --- |
| Given | a Project whose `glossary.csv` cannot be read |
| When | its dialog opens |
| Then | it says why and cannot be saved |
