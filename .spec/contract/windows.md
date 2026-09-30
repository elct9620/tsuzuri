# Windows

The windows Rust and the webview both reach for by label. Rust names each once, and the webview reads the name from `src/backend/bindings.ts`, generated from it, so neither side writes the label of a window the other made.

## Includes

- `src-tauri/src/window.rs`

## `VIDEO_WINDOW`

The label of the Video Window: Rust gives it to the window the main window's page opens for the Preview's video, and the webview opens that window under it and finds it by it to fill the screen or destroy it.

```rust
pub const VIDEO_WINDOW: &str = "";
```
