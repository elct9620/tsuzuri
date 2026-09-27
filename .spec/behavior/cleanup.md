# Simplified Cleanup

Cleaning the Simplified Chinese a speech recognition or translation Model leaves in a `zh-TW` text, by the OpenCC tables Tsuzuri carries, while a text already written in Traditional Chinese stays as the user wrote it.

## Includes

- `src-tauri/src/cleanup.rs`

## `SC-001` Cleaning Simplified characters

| Step | Statement |
| --- | --- |
| Given | the text `这是简单的测试` |
| When | it is cleaned of Simplified Chinese |
| Then | it reads `這是簡單的測試`, with 5 characters cleaned |

## `SC-002` Settling a reading by its phrase

A Simplified character with more than one Traditional form takes the one its phrase settles, as 发 is 髮 in hair and 發 elsewhere.

| Step | Statement |
| --- | --- |
| Given | the text `头发以后再说` |
| When | it is cleaned of Simplified Chinese |
| Then | it reads `頭髮以後再說` |

## `SC-003` Leaving a character that is Traditional too

A character OpenCC also lists as a Traditional form of its own is not guessed alone, since 后 is both 後 and the 后 of 皇后.

| Step | Statement |
| --- | --- |
| Given | the texts `皇后` and `后` |
| When | each is cleaned of Simplified Chinese |
| Then | each stays as written, with nothing cleaned |

## `SC-004` Keeping 台 as Taiwan writes it

| Step | Statement |
| --- | --- |
| Given | the text `台湾的台风` |
| When | it is cleaned of Simplified Chinese |
| Then | it reads `台灣的颱風` |

## `SC-005` Writing Taiwan's variant

| Step | Statement |
| --- | --- |
| Given | the text `里面` |
| When | it is cleaned of Simplified Chinese |
| Then | it reads `裡面`, as Taiwan writes 裡 |

## `SC-006` Leaving Traditional Chinese as written

| Step | Statement |
| --- | --- |
| Given | the text `台北的天氣很好，我們以後再說。` |
| When | it is cleaned of Simplified Chinese |
| Then | nothing is cleaned |
