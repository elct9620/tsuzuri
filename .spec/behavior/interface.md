# Interface

Writing the webview's text in the Interface Language, chosen from the system's language when the window opens.

## Includes

- `src/i18n.test.ts`

## `IF-001` Following the system language

| Step | Statement |
| --- | --- |
| Given | a system language of Traditional Chinese written as `zh-Hant-TW` |
| When | the interface starts |
| Then | its text is in Traditional Chinese and the page declares that language |

## `IF-002` Following a Taiwan locale that names no script

| Step | Statement |
| --- | --- |
| Given | a system language of `zh-TW` |
| When | the interface starts |
| Then | its text is in Traditional Chinese |

## `IF-003` Falling back to English

| Step | Statement |
| --- | --- |
| Given | a system language Tsuzuri has no translation for, such as `zh-CN`, or none reported |
| When | the interface starts |
| Then | its text is in English |

## `IF-004` Naming the Language of a Traditional Chinese interface

A Project's Primary Language follows the Interface Language until its directory records one.

| Step | Statement |
| --- | --- |
| Given | an interface in Traditional Chinese |
| When | the Language it stands for is asked |
| Then | it is `zh-TW` |

## `IF-005` Naming the Language of any other interface

| Step | Statement |
| --- | --- |
| Given | an interface in English |
| When | the Language it stands for is asked |
| Then | it is `en` |
