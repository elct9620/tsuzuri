# Changelog

## [0.3.0](https://github.com/elct9620/tsuzuri/compare/v0.2.0...v0.3.0) (2026-10-10)


### Features

* **editor:** add or edit a glossary term from a field's right-click menu ([fd477a4](https://github.com/elct9620/tsuzuri/commit/fd477a4589316a68b95407cdd45d9adaaeb7a193))
* **editor:** underline glossary terms and candidates in the fields ([dc0b35a](https://github.com/elct9620/tsuzuri/commit/dc0b35ab7bd6342673ef9d26d98deb2060a19e9f))
* **i18n:** switch the Interface Language from the Preferences at once ([0264487](https://github.com/elct9620/tsuzuri/commit/0264487c2a1d936075ecd41bf8fbda62c7d01ddc))
* **layout:** offer V1, V2 and V3 in the Preferences tab to try the editor's arrangements ([16bbfaa](https://github.com/elct9620/tsuzuri/commit/16bbfaa49357b0ddb3f23daf61148ceec817e758))
* **layout:** try V1 against V3 alone, and give V3's list the full width while the video is away ([8d2ace6](https://github.com/elct9620/tsuzuri/commit/8d2ace60d127a5988feb23d8565a693a5f24af44))
* **layout:** unfold the Current Segment's row in Layout V2 instead of showing a card ([cfbef6c](https://github.com/elct9620/tsuzuri/commit/cfbef6c61f6014a9dce7ee495b6c741fbae10c53))
* **preferences:** keep the Interface Language chosen ([eb3af2a](https://github.com/elct9620/tsuzuri/commit/eb3af2ae3162686705c0ce4776a40bbaad21329d))
* **preview:** show the Current Segment's length on its card ([30dbab3](https://github.com/elct9620/tsuzuri/commit/30dbab3791985a811344663897decb3246695076))
* **project:** mark where the Translation Glossary's terms are written ([651d018](https://github.com/elct9620/tsuzuri/commit/651d01837da77c8c6083ef5ff4c0b60fb0735d61))
* **project:** offer the proper nouns of a Chinese original as glossary candidates ([c6aeb07](https://github.com/elct9620/tsuzuri/commit/c6aeb07fac8bf6208229029740cbc9b105052f55))
* **settings:** explain each Preference beneath its name in a table ([3a9773d](https://github.com/elct9620/tsuzuri/commit/3a9773d7c88e219fd9e2e38fe90303e0eeff2b33))
* **settings:** head the version and updates with a version card ([64d4e0a](https://github.com/elct9620/tsuzuri/commit/64d4e0ab6006aa67bc49621716bc20a7f4a2c4ad))
* **settings:** show the Components as a status table ([1047dc9](https://github.com/elct9620/tsuzuri/commit/1047dc97e1a6b96a891d2089ca044a52436c341d))
* **settings:** show the settings as a page over the whole window ([73be192](https://github.com/elct9620/tsuzuri/commit/73be1922248756342390b7d17e8d083678745106))
* **webview:** gather the choices set once into a View menu, and show the Speaker column only where it is used ([a8eae7c](https://github.com/elct9620/tsuzuri/commit/a8eae7c8853acb38897459c42e76cdd5d63e3d94))
* **webview:** move the Current Resource's tasks into a resource bar beside the edit tools ([fcd7e0b](https://github.com/elct9620/tsuzuri/commit/fcd7e0bb214a33b618cccc796777ded817ff1bfb))


### Bug Fixes

* **deps:** take tauri 2.12.2 so right-click menu choices run again ([e8c9558](https://github.com/elct9620/tsuzuri/commit/e8c955870f60a0a1be0d654e013cb2354e969a49))
* **editing:** leave a key an input method is processing to the input method ([0727f32](https://github.com/elct9620/tsuzuri/commit/0727f326b14a8453967edf31a418a8459aa2d385))
* **editor:** leave the Project alone while something covers the editor ([2eec8c7](https://github.com/elct9620/tsuzuri/commit/2eec8c78f054c170e730409b929bffbbf748dcaa))
* **editor:** offer the glossary word under the pointer on a right-click ([ed889e9](https://github.com/elct9620/tsuzuri/commit/ed889e960075a90b0219c0234fe4da969918c816))
* **editor:** split a Segment only by the platform's own shortcut ([b9e639e](https://github.com/elct9620/tsuzuri/commit/b9e639ebe9e2e04a2ea60b0547566941a12887cf))
* **i18n:** count one in the singular and capitalise Segment in English ([fd05025](https://github.com/elct9620/tsuzuri/commit/fd05025566546dbecfccac11e3bd70ead6a6f0db))
* **i18n:** rewrite the text written outside Svelte as the language changes ([59cca56](https://github.com/elct9620/tsuzuri/commit/59cca566af602e7155573341c22d02d57ca1bc5c))
* **layout:** keep a row chosen in view where it stands, and give the list back its height ([83cbc7b](https://github.com/elct9620/tsuzuri/commit/83cbc7bc7d0ce0e26e49c6974ed2eb0ce0809278))
* **licenses:** list the webview packages the bundle carries ([088d51f](https://github.com/elct9620/tsuzuri/commit/088d51ffadf1b5b06b7224a370c95b22fa203010))
* **licenses:** name who wrote a bundled package without a license text ([5bcf02c](https://github.com/elct9620/tsuzuri/commit/5bcf02ca91a8681ae2083bff8c9f2db1c989a27a))
* **project:** tell why a Project action failed in a Notification ([c18dc43](https://github.com/elct9620/tsuzuri/commit/c18dc4395ed6d279ff4a1caffa2b90e34e751545))
* **replace:** open the replace dialog only while a Project is open ([ecb082a](https://github.com/elct9620/tsuzuri/commit/ecb082a21fa9d5c742836d64d531101d1591f7cd))
* **search:** open the search bar only while a Project is open ([8d04652](https://github.com/elct9620/tsuzuri/commit/8d046520f3c8f0a30a1ce64c611b5190d4aa4491))
* **settings:** choose every slot's Model through one Svelte Component ([b06eb8f](https://github.com/elct9620/tsuzuri/commit/b06eb8fab563a9a2405a1629f3e7baa89f82eb3d))
* **settings:** keep each English setting name and dialog label on one line ([de73fae](https://github.com/elct9620/tsuzuri/commit/de73fae2560ff459ccb6aef5733ba04d7231c493))
* **settings:** wrap the Interface Language's help within the window ([e948b5a](https://github.com/elct9620/tsuzuri/commit/e948b5a638e398684dd201a8bd3bde8eba6cdf0c))
* **tooltip:** hide the closed tooltip so it no longer lengthens the page in WebKit ([dc7468a](https://github.com/elct9620/tsuzuri/commit/dc7468aac366302964c3f8273547f0e6539c1d36))
* **versions:** keep the comparison in view however many Backups there are ([dd1b0c9](https://github.com/elct9620/tsuzuri/commit/dd1b0c9c205489a29f491cd6ca342e0c421ab3c3))
* **view-menu:** lay the View menu in two columns so it fits without scrolling ([96de926](https://github.com/elct9620/tsuzuri/commit/96de92698a82146a963c9ce4f67e6eedaf702ba2))

## [0.2.0](https://github.com/elct9620/tsuzuri/compare/v0.1.0...v0.2.0) (2026-10-04)


### Features

* **diarization:** diarize once transcribed, as the Project chooses ([9a09fb8](https://github.com/elct9620/tsuzuri/commit/9a09fb87070ee8beaba704f53452b02edfb10535))
* **diarization:** give a Resource's Segments their Speakers ([bb3f10e](https://github.com/elct9620/tsuzuri/commit/bb3f10ea21c0db9820258d450f9a9fbf40357fdf))
* **diarization:** run Speaker Diarization as the app's own child process ([39191e6](https://github.com/elct9620/tsuzuri/commit/39191e6732e85300df32ba13e40620e507410265))
* **diarization:** start a diarization from the toolbar ([9c24b19](https://github.com/elct9620/tsuzuri/commit/9c24b198729e84edd1e537880e973ad0c39fa916))
* **diarization:** tell speakers apart with Nemotron-3 Diarization ([ab2ad83](https://github.com/elct9620/tsuzuri/commit/ab2ad83560ab1df3708334e77c375c084f82bf01))
* **editing:** merge a Segment with the one before or after ([76ef0b0](https://github.com/elct9620/tsuzuri/commit/76ef0b08ecfde57a0d56975fc48bc8785665f818))
* **editing:** open a Segment's changes with a right-click ([75512c0](https://github.com/elct9620/tsuzuri/commit/75512c03e0aa36fbb112c2066277e4e9334166c7))
* **models:** add a Model Slot for speaker diarization ([d5c8c18](https://github.com/elct9620/tsuzuri/commit/d5c8c187d81d77a8328fd778feed262ff56be84c))
* **preview:** fold the player and the timeline away on their own ([7992bce](https://github.com/elct9620/tsuzuri/commit/7992bcecb5d0bac13220406fe123dd4380404fc3))
* **preview:** lengthen the silence once a Segment reaches its end ([bdb1eb4](https://github.com/elct9620/tsuzuri/commit/bdb1eb491754b466deba2cf99b3bc6d5dc7fab75))
* **preview:** let the Dummy Video be black or white ([f0b966e](https://github.com/elct9620/tsuzuri/commit/f0b966e3c3b0c3c899994c0781e4e4dc79226372))
* **preview:** let the Preferences say where choosing a Segment lands ([20cefc9](https://github.com/elct9620/tsuzuri/commit/20cefc9be5620098915556caaa5ce73ff48a07e0))
* **preview:** play silence under the Dummy Video for a subtitle alone ([00a7599](https://github.com/elct9620/tsuzuri/commit/00a7599c70d942777a41834c5feb2823c6925c3f))
* **preview:** show a Dummy Video for media without a picture ([3d8f541](https://github.com/elct9620/tsuzuri/commit/3d8f541183c5d79314dc18ade20c28d09c85f09e))
* **resources:** dock the Resource list by how the screen is held ([e4d6db6](https://github.com/elct9620/tsuzuri/commit/e4d6db69630e8f5fc45280b4656e1ec64bb14985))
* **settings:** set where choosing a Segment lands in a Preferences tab ([37581d7](https://github.com/elct9620/tsuzuri/commit/37581d7451272a33c5e3f5e034ac7f87bed287a4))
* **shortcuts:** list the Esc that leaves the Video Window's full screen ([2176813](https://github.com/elct9620/tsuzuri/commit/2176813ba8eb48fc1246991e3b5b3afbe74672ad))


### Bug Fixes

* **diarization:** refuse a Resource without a subtitle as no-subtitle ([ab95b9f](https://github.com/elct9620/tsuzuri/commit/ab95b9ff714f9ceb8b39aae5b9d7c96888b8a675))
* **editing:** merge Segments on one line, spaced beside English and numbers ([a865746](https://github.com/elct9620/tsuzuri/commit/a865746a7730645767b8a66c1db8548b69c7ccad))
* **preview:** draw what each fold button folds, and light it once folded ([969294b](https://github.com/elct9620/tsuzuri/commit/969294b87ce38a5c9f5412a94046af89e3eddae3))
* **preview:** size the row above the timeline by the video it holds ([adb199d](https://github.com/elct9620/tsuzuri/commit/adb199d344ed1036230dadc5827e413421525746))
* **shortcuts:** write a double click in the Interface Language ([46c4c96](https://github.com/elct9620/tsuzuri/commit/46c4c9656611b8c47ed63213d49a0b75b4f59bc1))

## [0.1.0](https://github.com/elct9620/tsuzuri/compare/v0.1.0...v0.1.0) (2026-09-29)


### Features

* **updates:** name releases v0.2.0 and Build 20260928+12 ([304ebeb](https://github.com/elct9620/tsuzuri/commit/304ebeb0480b14c0bd9cf14880a8390552f208b8))
