# Interface

Writing the webview's text in the Interface Language, chosen from the system's language when the window opens, keeping the toolbar's menus out of the way, showing tooltips where no container cuts them off, listing the shortcuts, showing the settings as a page over the whole window, docking the Resource list beside a window wide enough to hold it, telling what just happened in Notifications and that an edit was saved in the Save Mark, opening where Tsuzuri can be sponsored, and sizing the window the first time it opens; afterwards the window opens at the size and place it was closed at.

## Includes

- `src/i18n.test.ts`
- `src/ui/menu.test.ts`
- `src/components/Tooltip.test.ts`
- `src/components/Notifications.test.ts`
- `src/state/save-mark.test.ts`
- `src/ui/shortcuts.test.ts`
- `src/components/ShortcutsDialog.test.ts`
- `src-tauri/src/window.rs`
- `src/components/settings/general/About.test.ts`
- `src/components/settings/SettingsPage.test.ts`
- `src/page.test.ts`
- `src/state/resource-dock.test.ts`

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

## `IF-006` Closing a bar's menu once an item is chosen

A menu stays open only while focus is inside it, so clicking anywhere else closes it too.

| Step | Statement |
| --- | --- |
| Given | an open menu of the toolbar or the resource bar |
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

A dialog is drawn above the whole page, so the tooltip is drawn in the layer above it, laid over the dialog as each tooltip shows.

| Step | Statement |
| --- | --- |
| Given | an element with a tooltip in an open dialog |
| When | the pointer moves onto it |
| Then | the tooltip is shown above that dialog |

## `IF-053` Showing a tooltip once focus reaches an element

The keyboard reaches the same explanation the pointer does, moving focus to each ⓘ in the settings in turn.

| Step | Statement |
| --- | --- |
| Given | an element with a tooltip |
| When | focus moves onto it |
| Then | a tooltip shows its text |

## `IF-012` Writing a tooltip in the Interface Language

| Step | Statement |
| --- | --- |
| Given | the help beside the Primary Language setting, naming the text `settings.primaryLanguageHelp` |
| When | the page is written in Traditional Chinese |
| Then | its tooltip reads that text in Traditional Chinese |

## `IF-013` Explaining every setting

Each setting says what it is for and how to use it, since its name alone rarely does.

| Step | Statement |
| --- | --- |
| Given | the settings page |
| When | its rows are read in either Interface Language |
| Then | every row carries a tooltip that explains it |

## `IF-054` Naming every button in the Interface Language

A button drawn as an icon alone is known only by its name, which a screen reader reads and a translation can leave out.

| Step | Statement |
| --- | --- |
| Given | the page written in Traditional Chinese |
| When | its buttons are read |
| Then | each has a name, and none is the key of a text |

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

## `IF-039` Letting a refusal go on its own

A refusal is fixed by asking again, so it goes like any other rather than piling up.

| Step | Statement |
| --- | --- |
| Given | a Notification that an edit was refused as `invalid-times` |
| When | a few seconds pass |
| Then | it is no longer shown |

## `IF-016` Closing a Notification that stays by its close button

| Step | Statement |
| --- | --- |
| Given | a Notification that a task failed |
| When | its close button is clicked |
| Then | it is no longer shown |

## `IF-041` Closing a Notification before it goes

Once it is read, waiting out its countdown only keeps it in the way.

| Step | Statement |
| --- | --- |
| Given | a Notification that a task finished |
| When | its close button is clicked |
| Then | it is no longer shown |

## `IF-017` Stacking every Notification

One replacing another would take away what the earlier one said, or offered, before it could be read.

| Step | Statement |
| --- | --- |
| Given | a Notification that a translation finished |
| When | another translation finishes |
| Then | two Notifications say a translation finished |

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

## `IF-020` Letting a Notification that offers something to do go on its own

Its offer stays within reach while the pointer or focus rests on it (IF-024, IF-026), so it goes like any other rather than piling up.

| Step | Statement |
| --- | --- |
| Given | a Notification that an edit was saved, offering to add a Speaker to the Translation Glossary |
| When | a few seconds pass with nothing resting on it |
| Then | it is no longer shown |

## `IF-021` Showing how long a Notification stays

| Step | Statement |
| --- | --- |
| Given | a Notification that a task finished |
| When | it shows |
| Then | it has a countdown bar and a close button |

## `IF-022` Showing that a Notification stays

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

The newest say the most about what just happened, so the oldest goes first whatever its kind.

| Step | Statement |
| --- | --- |
| Given | a Notification that a task failed, then four that tasks finished |
| When | another task finishes |
| Then | five are shown: the five latest that tasks finished, the failure taken away |

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

## `IF-029` Keeping a tooltip on screen near the right edge

| Step | Statement |
| --- | --- |
| Given | an element with a tooltip in the right half of the window |
| When | the pointer comes onto it |
| Then | its tooltip opens to its left |

## `IF-030` Opening the shortcut list by shortcut

Shortcuts grow faster than anyone remembers them, so one more opens the list of them, even while a text is being typed.

| Step | Statement |
| --- | --- |
| Given | the interface on Linux with focus in a text field |
| When | Ctrl+/ is pressed |
| Then | the shortcut list is open |

## `IF-031` Opening the shortcut list with a question mark

| Step | Statement |
| --- | --- |
| Given | focus outside any text field |
| When | ? is pressed |
| Then | the shortcut list is open |

## `IF-032` Leaving a question mark to a text field

| Step | Statement |
| --- | --- |
| Given | focus in a text field |
| When | ? is pressed |
| Then | the shortcut list stays closed and the field takes the key |

## `IF-055` Closing a modal by its button

Every modal is drawn the same way, so what holds for the shortcut list holds for each one a user may close.

| Step | Statement |
| --- | --- |
| Given | the shortcut list open |
| When | its 關閉 button is clicked |
| Then | the shortcut list is closed |

## `IF-056` Closing a modal by clicking outside it

| Step | Statement |
| --- | --- |
| Given | the shortcut list open |
| When | the backdrop around it is clicked |
| Then | the shortcut list is closed |

## `IF-033` Listing only this platform's keys

macOS gives some keys to the system, so each platform has keys of its own, and the list shows only the ones that work here.

| Step | Statement |
| --- | --- |
| Given | the interface on macOS |
| When | the shortcut list opens |
| Then | replacing reads `⌘` `⌥` `F`, and no key reads `Ctrl` |

## `IF-034` Explaining every shortcut

A key alone does not say where it works or what it leaves alone, so each shortcut says so in its tooltip.

| Step | Statement |
| --- | --- |
| Given | the shortcut list |
| When | its rows are read in either Interface Language |
| Then | every row carries a tooltip that explains it |

## `IF-035` Naming a button's shortcut in its tooltip

| Step | Statement |
| --- | --- |
| Given | the interface on Linux and the button that turns following playback on and off |
| When | the pointer comes onto it |
| Then | its tooltip ends with `（Ctrl+L）` |

## `IF-036` Listing every key the interface binds

| Step | Statement |
| --- | --- |
| Given | the page as `index.html` and its Svelte Components write it, and the modules they read |
| When | the Shortcuts they match a key against or name in a tooltip are read |
| Then | the shortcut list has each of them |

## `IF-043` Binding every key the shortcut list names

A key the list shows and nothing answers to is a promise the interface does not keep, so the list is held to what is bound as what is bound is held to the list.

| Step | Statement |
| --- | --- |
| Given | the shortcut list, and the Shortcuts the page's Svelte Components and modules match a key against |
| When | each key the list names for either platform is looked for among them |
| Then | every one belongs to a Shortcut something matches a key against |

## `IF-044` Listing every key the app menu takes

The app menu takes its keys before the webview sees them, so the keys it is given are held to the list too.

| Step | Statement |
| --- | --- |
| Given | the Edit menu as Rust builds it on macOS |
| When | the keys of its items are read |
| Then | the shortcut list has each of them among the keys of macOS |

## `IF-045` Listing the key that leaves the Video Window's full screen

The Video Window is another window, so its key is bound there rather than by an action; it is still a key the interface answers to, and the list shows it beside the double click.

| Step | Statement |
| --- | --- |
| Given | the shortcut list |
| When | its row for the Video Window's full screen is read |
| Then | its keys read a double click or `Esc` |

## `IF-037` Letting the Save Mark go on its own

| Step | Statement |
| --- | --- |
| Given | the Save Mark shown after an edit was saved |
| When | a moment passes |
| Then | it is no longer shown |

## `IF-038` Keeping the Save Mark while edits keep being saved

Each edit saved is marked anew rather than stacked, so writing field after field shows one mark for as long as it goes on.

| Step | Statement |
| --- | --- |
| Given | the Save Mark shown after an edit was saved, most of its moment passed |
| When | another edit is saved |
| Then | one Save Mark is shown, for a whole moment from the latest edit |

## `IF-040` Stopping the countdown of a Notification going away

| Step | Statement |
| --- | --- |
| Given | a Notification offering something to do, counting down |
| When | what it offers is taken, and it fades away |
| Then | its countdown stays where it stopped |

## `IF-042` Opening where Tsuzuri can be sponsored

| Step | Statement |
| --- | --- |
| Given | the About section of the settings |
| When | sponsoring is chosen |
| Then | Rust is asked to open the sponsorship page |

## `IF-046` Docking the Resource list beside a landscape window

A window held landscape has width to spare, while one turned upright to show more Segments needs all of its width for them; each starts the way it is held until the user chooses.

| Step | Statement |
| --- | --- |
| Given | a window wide enough to dock the Resource list, held landscape, with nothing chosen |
| When | the page opens |
| Then | the Resource list is docked beside the editor |

## `IF-047` Laying the Resource list over a portrait window

| Step | Statement |
| --- | --- |
| Given | a window wide enough to dock the Resource list, held portrait, with nothing chosen |
| When | the page opens |
| Then | the Resource list is not docked |

## `IF-048` Undocking the Resource list with its button

| Step | Statement |
| --- | --- |
| Given | a wide window with the Resource list docked |
| When | the Resource list's button is pressed |
| Then | the Resource list is not docked |

## `IF-049` Docking the Resource list by shortcut

| Step | Statement |
| --- | --- |
| Given | a wide window held portrait with the Resource list not docked |
| When | ⌘B on macOS or Ctrl+B elsewhere is pressed |
| Then | the Resource list is docked |

## `IF-050` Keeping the Resource list as chosen for the orientation

| Step | Statement |
| --- | --- |
| Given | the Resource list undocked in a landscape window |
| When | the page opens again in a landscape window |
| Then | the Resource list is not docked |

## `IF-051` Following the screen as it turns

| Step | Statement |
| --- | --- |
| Given | the Resource list undocked in a landscape window, nothing chosen for portrait |
| When | the screen turns portrait and then landscape again |
| Then | the Resource list is not docked |

## `IF-052` Opening the Resource list by shortcut in a narrow window

A narrow window never docks the list, so the shortcut lays it over the editor as its button does.

| Step | Statement |
| --- | --- |
| Given | a window too narrow to dock the Resource list |
| When | ⌘B on macOS or Ctrl+B elsewhere is pressed |
| Then | the Resource list is laid over the editor |

## `IF-057` Showing the settings over the whole window

The settings hold tables and explanations that need the window's width, so they take the whole of it.

| Step | Statement |
| --- | --- |
| Given | a Project open in the editor |
| When | the settings are opened from the toolbar |
| Then | the settings show and the editor is hidden |

## `IF-058` Going back from the settings by their button

| Step | Statement |
| --- | --- |
| Given | the settings opened from the editor |
| When | the back button is clicked |
| Then | the editor shows again and the settings are hidden |

## `IF-059` Going back from the settings by Esc

| Step | Statement |
| --- | --- |
| Given | the settings opened from the editor |
| When | Esc is pressed |
| Then | the editor shows again and the settings are hidden |

## `IF-060` Closing a dialog over the settings before the settings

A dialog the settings opened, such as the License Notice, takes Esc first.

| Step | Statement |
| --- | --- |
| Given | the License Notice open over the settings |
| When | Esc is pressed |
| Then | the settings still show |

## `IF-061` Going back to the start screen

| Step | Statement |
| --- | --- |
| Given | the settings opened from the start screen, with no Project |
| When | the back button is clicked |
| Then | the start screen shows again |

## `IF-062` Pausing playback as the settings open

The settings hide the Preview, so media playing on would be heard with nothing to see.

| Step | Statement |
| --- | --- |
| Given | the media playing |
| When | the settings are opened |
| Then | the media is paused |

## `IF-063` Keeping the editor while the settings show

The editor is hidden rather than drawn again, so where the user was is still there on return.

| Step | Statement |
| --- | --- |
| Given | the settings opened from the editor |
| When | the back button is clicked |
| Then | the editor shown is the one left, not one drawn anew |

## `IF-064` Showing one section of the settings at a time

| Step | Statement |
| --- | --- |
| Given | the settings showing the version and updates |
| When | the Components are chosen from the section list |
| Then | only the Components section shows |

## `IF-065` Taking focus into the settings and back

Focus goes where the settings begin and returns where it was, as it does for a modal, so the keyboard is never left on a hidden button.

| Step | Statement |
| --- | --- |
| Given | the settings opened by the toolbar's button |
| When | the back button is clicked |
| Then | focus was on the back button while the settings showed and is on the toolbar's button again |

## `IF-066` Keeping the editor's keys from the Project while something covers it

The editor stays drawn under the settings and under a modal, so its keys would change Segments the user is not working on.

| Step | Statement |
| --- | --- |
| Given | the settings or a modal shown over the editor |
| When | Ctrl/⌘+Z is pressed outside a text field |
| Then | nothing is undone |

## `IF-067` Keeping the Edit menu from the Project while the settings show

| Step | Statement |
| --- | --- |
| Given | the settings shown over the editor |
| When | Undo is chosen from the Edit menu outside a text field |
| Then | nothing is undone |

## `IF-068` Keeping the play key from the media while the settings show

| Step | Statement |
| --- | --- |
| Given | the settings shown over the editor |
| When | the play key is pressed outside a control |
| Then | the media stays paused |
