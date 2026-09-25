# Interface

Writing the webview's text in the Interface Language, chosen from the system's language when the window opens, keeping the toolbar's menus out of the way, showing tooltips where no container cuts them off, and sizing the window the first time it opens; afterwards the window opens at the size and place it was closed at.

## Includes

- `src/i18n.test.ts`
- `src/menu.test.ts`
- `src/controllers/tooltip_controller.test.ts`
- `src-tauri/src/window.rs`

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

## `IF-006` Closing a toolbar menu once an item is chosen

A menu stays open only while focus is inside it, so clicking anywhere else closes it too.

| Step | Statement |
| --- | --- |
| Given | an open toolbar menu |
| When | one of its items is chosen |
| Then | focus leaves the menu |

## `IF-007` Sizing the first window to the screen

| Step | Statement |
| --- | --- |
| Given | a screen whose work area is 1920×1080 |
| When | the window opens for the first time |
| Then | it is 1536×864 |

## `IF-008` Sizing the first window without a screen size

| Step | Statement |
| --- | --- |
| Given | a screen that reports no size |
| When | the window opens for the first time |
| Then | it is 1200×900 |

## `IF-009` Showing a tooltip beside what the pointer is on

The tooltip is drawn outside the element that holds it, so a list that scrolls or clips its rows does not cut it off.

| Step | Statement |
| --- | --- |
| Given | an element with a tooltip |
| When | the pointer moves onto it |
| Then | a tooltip shows its text |

## `IF-010` Hiding the tooltip once the pointer leaves

| Step | Statement |
| --- | --- |
| Given | a tooltip shown for an element |
| When | the pointer leaves it |
| Then | no tooltip is shown |

## `IF-011` Showing a tooltip over an open dialog

A dialog is drawn above the whole page, so the tooltip of an element inside it is drawn inside the dialog too.

| Step | Statement |
| --- | --- |
| Given | an element with a tooltip in an open dialog |
| When | the pointer moves onto it |
| Then | the tooltip is shown inside that dialog |
