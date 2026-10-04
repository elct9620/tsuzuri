# Processes

The one way a Component is launched, so every child process is recorded and cleaned up.

## Includes

- `src-tauri/src/processes.rs`
- `src-tauri/src/diarization/subcommand.rs`

## `Processes::spawn`

Launch an executable by absolute path and record its PID. Its events end with the exit status, after everything it wrote, so a caller may stop at the exit status.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Processes {
    pub fn spawn(&self, app: &AppHandle, program: &Path, args: &[String]) -> Result<(Receiver<CommandEvent>, u32), String> {}
}
```

## `Processes::kill_all`

Kill every process still running, with the processes each of them started; called when the app exits.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Processes {
    pub fn kill_all(&self) {}
}
```

## `reap_strays`

Kill the Stray Processes a previous launch recorded, never the launching app itself, then clear the record.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub fn reap_strays(record: &Path) {}
```

## `run_diarize_subcommand`

Run Speaker Diarization as a child process of the app when the first argument is `diarize`, as `diarize <model.gguf> <audio.wav> <turns.json>`: write the Speaker Turns to `turns.json`, report `diarize: progress = N%` lines to `stderr` as it goes, and answer exit code 0, or 1 with the reason on `stderr`. Any other arguments answer none, and the app starts as usual.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub fn run_diarize_subcommand(args: &[String], stderr: &mut impl Write) -> Option<i32> {}
```
