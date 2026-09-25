# Processes

The one way a Component is launched, so every child process is recorded and cleaned up.

## Includes

- `src-tauri/src/processes.rs`

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

## `Processes::kill_all_except`

Kill every process still running but those `kept` names, with the processes each of them started; a cancelled Mode stops what it started this way, leaving what ran before it.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Processes {
    pub fn kill_all_except(&self, kept: &HashSet<u32>) {}
}
```

## `Processes::pids`

The PIDs of every process still running.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl Processes {
    pub fn pids(&self) -> HashSet<u32> {}
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
