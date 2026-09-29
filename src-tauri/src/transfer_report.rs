/// Paces a transfer's progress to once per whole percent, or per MiB when its size is unknown,
/// so a large file does not flood the webview with events.
#[derive(Debug, Default)]
pub struct TransferReport {
    last_step: Option<u64>,
}

impl TransferReport {
    const UNSIZED_STEP: u64 = 1024 * 1024;

    /// Moves to the step `transferred` bytes of `total` reach, answering whether it is one not reported yet.
    pub fn advance(&mut self, transferred: u64, total: Option<u64>) -> bool {
        let step = match total {
            Some(total) if total > 0 => transferred * 100 / total,
            _ => transferred / Self::UNSIZED_STEP,
        };
        if self.last_step == Some(step) {
            return false;
        }
        self.last_step = Some(step);
        true
    }
}
