# Ports

The two ways a use case reaches outside Rust's own logic, so transcription and translation run the same under Tauri and under tests without knowing either.

## Includes

- `src-tauri/src/progress.rs`
- `src-tauri/src/steps.rs`

## `Progress`

Where a use case tells the webview how far it has come, and that the Project changed.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Progress {}
```

## `Progress::report`

Tell the webview a Phase has started, with no percentage, or how far into it the task is.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Progress {
    fn report(&self, phase: &'static str, percent: Option<u8>);
}
```

## `Progress::announce_project`

Tell the webview the Project changed, so it asks `current_project` for what it now holds.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Progress {
    fn announce_project(&self);
}
```

## `Steps`

How a use case runs a Component: started by absolute path, its output read line by line, stopped when no longer needed.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Steps {}
```

## `Steps::start`

Start a Component by absolute path and answer its events with its PID. The events end with the exit, after every line it wrote, so a caller may stop at the exit.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Steps {
    fn start(&self, program: &Path, args: &[String]) -> Result<(Receiver<StepEvent>, u32), String>;
}
```

## `Steps::stop`

Stop a Component started by `Steps::start` that is still running.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Steps {
    fn stop(&self, pid: u32);
}
```
