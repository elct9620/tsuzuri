use std::path::Path;

use tokio::sync::mpsc::Receiver;

/// What a started Component does: each line it writes, without its line ending, and last how it ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepEvent {
    Stdout(String),
    Stderr(String),
    Error(String),
    Exit(Option<i32>),
}

pub trait Steps {
    fn start(&self, program: &Path, args: &[String]) -> Result<(Receiver<StepEvent>, u32), String>;
    fn stop(&self, pid: u32);
}
