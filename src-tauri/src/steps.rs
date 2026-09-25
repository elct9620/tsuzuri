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

/// Lets one Mode run at a time: another waits its turn rather than unloading or stopping the
/// Model the running one uses.
#[derive(Default)]
pub struct ModeLock(tokio::sync::Mutex<()>);

impl ModeLock {
    /// Waits until no other Mode runs; the Mode keeps its turn until the answer is dropped.
    pub async fn wait_turn(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.0.lock().await
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use super::*;

    // @behavior PR-006
    #[tokio::test]
    async fn starts_a_mode_only_once_the_running_one_ends() {
        let lock = Arc::new(ModeLock::default());
        let order = Arc::new(std::sync::Mutex::new(Vec::new()));
        let turn = lock.wait_turn().await;

        let waiting = tokio::spawn({
            let (lock, order) = (Arc::clone(&lock), Arc::clone(&order));
            async move {
                let _turn = lock.wait_turn().await;
                order.lock().unwrap().push("second starts");
            }
        });
        tokio::time::sleep(Duration::from_millis(50)).await;
        order.lock().unwrap().push("first ends");
        drop(turn);
        waiting.await.unwrap();

        assert_eq!(*order.lock().unwrap(), vec!["first ends", "second starts"]);
    }
}
