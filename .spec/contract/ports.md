# Ports

The two ways a use case reaches outside Rust's own logic, and the Mode Run that owns them for one Mode, so transcription and translation run the same under Tauri and under tests without knowing either.

## Includes

- `src-tauri/src/progress.rs`
- `src-tauri/src/steps.rs`
- `src-tauri/src/timing.rs`

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
    fn report(&self, phase: Phase, percent: Option<u8>);
}
```

## `Phase`

The Phases a Mode goes through: `prepare`, `convert`, `load`, `transcribe`, `diarize`, `detect` and `translate`, the names `pipeline-progress` and the seconds each took carry to the webview.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub enum Phase {}
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

Start a Component by absolute path and answer its events with its PID. The events end with the exit, after every line it wrote, so a caller may stop at the exit. The events end only once the Component has ended, so their end means it ended even without an exit.

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

## `Steps::stop_started`

Stop every Component these Steps started that is still running, and none started elsewhere; a cancelled Mode Run ends this way.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Steps {
    fn stop_started(&self);
}
```

## `ModeLock::begin`

Wait for the Mode Run before to end, then begin one with `ports` as the only Steps and Progress it uses.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl ModeLock {
    pub async fn begin<P: Steps>(&self, ports: P) -> ModeRun<'_, P> {}
}
```

## `ModeRun::run_until_cancelled`

Run `task` until it ends or the Mode Run is asked to stop; then the Components it started are stopped and it fails as `mode-cancelled`.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl<P: Steps> ModeRun<'_, P> {
    pub async fn run_until_cancelled<T>(&self, task: impl Future<Output = Result<T, Failure>>) -> Result<T, Failure> {}
}
```

## `ModeRun::keep`

Keep `guard` until the Mode Run ends, however it ends; a use case hands over its hold on the Resource this way, so the hold lasts as long as the run.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
impl<'a, P: Steps> ModeRun<'a, P> {
    pub fn keep(&self, guard: impl Send + 'a) {}
}
```

## `Mode`

The shape every Mode takes, so one skeleton holds, runs and cancels each of them; the Modes stay a fixed set, each run on its own.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Mode {}
```

## `Mode::hold`

Take what the Mode works on and hold the subtitles it writes, both in one hold of the Current Project's lock.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Mode {
    fn hold<'p>(&self, project: &'p CurrentProject) -> Result<(Self::Target, ResourceHold<'p>), Failure>;
}
```

## `Mode::run`

Carry out the Mode on what it holds, through the Mode Run's ports.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Mode {
    fn run<'a, P: Progress + Steps + Sync>(&self, run: &ModeRun<'a, P>, project: &'a CurrentProject, target: Self::Target, phases: Phases) -> impl Future<Output = Result<Self::Outcome, Failure>> + Send;
}
```

## `Mode::release_cancelled`

Free what a cancelled run leaves behind outside its Components.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub trait Mode {
    fn release_cancelled(&self) -> impl Future<Output = ()> + Send {}
}
```

## `run_mode`

Run `mode` until it ends or is cancelled, holding its target from the start of the run to its end.

| Attribute | Value |
| --- | --- |
| internal | yes |

```rust
pub async fn run_mode<'a, M: Mode>(mode: &M, run: &ModeRun<'a, impl Progress + Steps + Sync>, project: &'a CurrentProject, phases: Phases) -> Result<M::Outcome, Failure> {}
```
