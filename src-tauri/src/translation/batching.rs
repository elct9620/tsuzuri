use std::ops::Range;

/// Segments adjacent windows share, so a Split Sentence across a window's edge is whole in the next.
const WINDOW_OVERLAP: usize = 2;
/// How far past the Batch size a merged run of Split Sentences may grow and still be kept whole.
const SPLIT_SENTENCE_LIMIT: usize = 2;

/// The windows Split Sentences are looked for in: `size` Segments each, overlapping by two.
pub fn windows(len: usize, size: usize) -> Vec<Range<usize>> {
    let step = size.saturating_sub(WINDOW_OVERLAP).max(1);
    let mut windows = Vec::new();
    let mut start = 0;
    while start < len {
        windows.push(start..(start + size).min(len));
        if start + size >= len {
            break;
        }
        start += step;
    }
    windows
}

/// Batches of `size` Segments that never cut through a Split Sentence, growing past `size` for one.
/// Touching Split Sentences merge; a merged run longer than twice `size` is batched as usual.
pub fn batches(len: usize, size: usize, split_sentences: &[Vec<usize>]) -> Vec<Range<usize>> {
    let whole = whole_runs(len, size, split_sentences);
    let mut batches = Vec::new();
    let mut current = 0..0;
    let mut position = 0;
    while position < len {
        let block = whole
            .iter()
            .find(|run| run.contains(&position))
            .cloned()
            .unwrap_or(position..position + 1);
        if !current.is_empty() && current.len() + block.len() > size {
            batches.push(current.clone());
            current = block.start..block.start;
        }
        current.end = block.end;
        position = block.end;
        if current.len() >= size {
            batches.push(current.clone());
            current = position..position;
        }
    }
    if !current.is_empty() {
        batches.push(current);
    }
    batches
}

/// The runs of Segments to keep in one Batch: Split Sentences merged where they touch or overlap,
/// leaving out any run too long to keep whole.
fn whole_runs(len: usize, size: usize, split_sentences: &[Vec<usize>]) -> Vec<Range<usize>> {
    let mut spans: Vec<Range<usize>> = split_sentences
        .iter()
        .filter_map(|sentence| {
            let first = *sentence.iter().filter(|&&index| index < len).min()?;
            let last = *sentence.iter().filter(|&&index| index < len).max()?;
            Some(first..last + 1)
        })
        .collect();
    spans.sort_by_key(|span| span.start);
    let mut merged: Vec<Range<usize>> = Vec::new();
    for span in spans {
        match merged.last_mut() {
            Some(last) if span.start <= last.end => last.end = last.end.max(span.end),
            _ => merged.push(span),
        }
    }
    merged
        .into_iter()
        .filter(|run| run.len() <= size * SPLIT_SENTENCE_LIMIT)
        .collect()
}
