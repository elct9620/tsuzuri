# Interface

Writing the webview's text in the Interface Language, chosen from the system's language when the window opens, keeping the toolbar's menus out of the way, showing tooltips where no container cuts them off, telling what just happened in Notifications, and sizing the window the first time it opens; afterwards the window opens at the size and place it was closed at.

## Includes

- `src/i18n.test.ts`
- `src/ui/menu.test.ts`
- `src/controllers/tooltip_controller.test.ts`
- `src/ui/notification.test.ts`
- `src/ui/icons.test.ts`
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

## `IF-012` Writing a tooltip in the Interface Language

| Step | Statement |
| --- | --- |
| Given | an element whose tooltip names the text `settings.primaryLanguageHelp` |
| When | the page is written in Traditional Chinese |
| Then | its tooltip reads that text in Traditional Chinese |

## `IF-013` Explaining every setting

Each setting says what it is for and how to use it, since its name alone rarely does.

| Step | Statement |
| --- | --- |
| Given | the settings dialog |
| When | its rows are read in either Interface Language |
| Then | every row carries a tooltip that explains it |

## `IF-014` Letting a Notification go on its own

| Step | Statement |
| --- | --- |
| Given | a Notification that a task finished |
| When | a few seconds pass |
| Then | it is no longer shown |

## `IF-015` Keeping a failure until it is closed

| Step | Statement |
| --- | --- |
| Given | a Notification that a task failed |
| When | a few seconds pass |
| Then | it is still shown |

## `IF-016` Closing a Notification that stays by its close button

| Step | Statement |
| --- | --- |
| Given | a Notification that a task failed |
| When | its close button is clicked |
| Then | it is no longer shown |

## `IF-017` Stacking every Notification

One replacing another would take away what the earlier one said, or offered, before it could be read.

| Step | Statement |
| --- | --- |
| Given | a Notification that an edit was saved |
| When | another edit is saved |
| Then | two Notifications say an edit was saved |

## `IF-018` Marking the kind of a Notification

| Step | Statement |
| --- | --- |
| Given | a Notification that a task failed |
| When | it shows |
| Then | its title is marked with the icon of a failure |

## `IF-019` Listing the details of a Notification

| Step | Statement |
| --- | --- |
| Given | a Notification of a finished task with the seconds of two Phases |
| When | it shows |
| Then | each Phase is a row under the title with its seconds beside it |

## `IF-020` Keeping a Notification that offers something to do

A Notification that went on its own would take its offer with it before it could be taken.

| Step | Statement |
| --- | --- |
| Given | a Notification that an edit was saved, offering to add a Speaker to the Translation Glossary |
| When | a few seconds pass |
| Then | it is still shown |

## `IF-021` Showing how long a Notification stays

| Step | Statement |
| --- | --- |
| Given | a Notification that a task finished |
| When | it shows |
| Then | it has a countdown bar and no close button |

## `IF-022` Offering a close button on a Notification that stays

| Step | Statement |
| --- | --- |
| Given | a Notification that a task failed |
| When | it shows |
| Then | it has a close button and no countdown bar |

## `IF-023` Keeping a Notification open while it is clicked

A click meant for its text or its button should not take it away.

| Step | Statement |
| --- | --- |
| Given | a Notification that a task failed |
| When | the Notification itself is clicked |
| Then | it is still shown |

## `IF-024` Pausing a Notification while the pointer rests on it

| Step | Statement |
| --- | --- |
| Given | a Notification that a task finished, with the pointer resting on it |
| When | longer than it stays passes |
| Then | it is still shown, and goes once the pointer has left it for the time it had left |

## `IF-025` Keeping at most five Notifications

| Step | Statement |
| --- | --- |
| Given | a Notification that a task failed, then four that tasks finished |
| When | another task finishes |
| Then | five are shown: the failure and the four latest that tasks finished |


## `IF-026` Pausing a Notification while focus is within it

| Step | Statement |
| --- | --- |
| Given | a Notification that a task finished, with focus within it |
| When | longer than it stays passes |
| Then | it is still shown |

## `IF-027` Hiding the tooltip while a list scrolls

A scrolling list does not tell its page it scrolled, so the tooltip would stay where the element used to be.

| Step | Statement |
| --- | --- |
| Given | a tooltip shown beside an element in a list |
| When | the list scrolls |
| Then | no tooltip is shown |

## `IF-028` Drawing every icon the page names

| Step | Statement |
| --- | --- |
| Given | the page as `index.html` writes it |
| When | its icons are drawn |
| Then | no element naming an icon is left undrawn |

## `IF-029` Keeping a tooltip on screen near the right edge

| Step | Statement |
| --- | --- |
| Given | an element with a tooltip in the right half of the window |
| When | the pointer comes onto it |
| Then | its tooltip opens to its left |
