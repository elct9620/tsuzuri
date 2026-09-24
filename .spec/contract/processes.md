# Processes

The one way a Component is launched, so every child process is recorded and cleaned up.

## Includes

- `src-tauri/src/processes.rs`

## `Processes::spawn`

Launch an executable by absolute path and record its PID.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Processes {
    pub fn spawn(&self, app: &AppHandle, program: &Path, args: &[String]) -> Result<(Receiver<CommandEvent>, u32), String> {}
}
```

## `Processes::kill_all`

Kill every process still running; called when the app exits.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Processes {
    pub fn kill_all(&self) {}
}
```

## `reap_strays`

Kill the Stray Processes a previous launch recorded, then clear the record.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub fn reap_strays(record: &Path) {}
```
