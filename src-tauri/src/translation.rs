use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::cleanup::clean_translations;
use crate::failure::Failure;
use crate::language::{Language, LanguagePair};
use crate::progress::{enter, Progress};
use crate::project::{CurrentProject, ResourceHold, Restoration, SegmentSpan, TranslationSource};
use crate::steps::{Mode, ModeRun, Steps};
use crate::timing::Phase;
use crate::timing::{PhaseTiming, Phases};
use crate::toolchain::{ModelSettings, ModelSlot};
use crate::transcript::Segment;

mod batching;
pub mod commands;
#[cfg(test)]
mod fake_llama;
mod llama;
mod prompt;
mod repair;
mod resident;
mod settings;
mod speaker_labels;

use llama::{ServerProcess, TranslationModel};
use repair::BatchSurroundings;
pub use resident::ResidentLlama;
pub use settings::TranslationSettings;
use speaker_labels::LabelledText;

/// The choices the Translate panel offers for one translation.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, specta::Type)]
#[serde(default)]
pub struct TranslationOptions {
    has_speaker_labels: bool,
    has_self_review: bool,
    /// The Rolling Summary's word limit, or none to keep no summary.
    summary_word_limit: Option<usize>,
    /// Whether a Simplified Cleanup follows a translation into `zh-TW`.
    is_simplified_cleaned: bool,
}

/// Everything a translation is asked to do besides the Project it reads.
pub struct TranslationPlan {
    /// The Language to translate into; the Project's Primary Language is where it starts from.
    pub target: Language,
    pub options: TranslationOptions,
    pub settings: TranslationSettings,
    pub scope: TranslationScope,
}

impl TranslationPlan {
    /// Whether a Simplified Cleanup follows this translation: asked for, into `zh-TW`.
    fn is_simplified_cleaned(&self) -> bool {
        self.options.is_simplified_cleaned && self.target == Language::TraditionalChinese
    }
}

/// Which Segments a translation writes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TranslationScope {
    /// Every Segment, written as a new translation file.
    Whole,
    /// Those at these positions, translated again into the translation shown and written as one
    /// change, each other keeping its translation.
    Segments(Vec<usize>),
}

impl TranslationScope {
    /// The positions of the Segments translated again, or none for every Segment.
    fn indexes(&self) -> Option<&[usize]> {
        match self {
            TranslationScope::Whole => None,
            TranslationScope::Segments(indexes) => Some(indexes),
        }
    }
}

/// Lines on either side of chosen Segments shown for context: before them translated, after them
/// as source text.
const CONTEXT_LINES: usize = 3;

/// What to translate: the Segments, the Languages they go between, and how.
struct TranslationJob<'a> {
    segments: &'a [Segment],
    languages: LanguagePair,
    settings: TranslationSettings,
    /// The Translation Glossary's terms, empty when none is loaded.
    glossary_terms: &'a [(String, String)],
    /// The Rolling Summary's word limit, or none when it is off.
    summary_word_limit: Option<usize>,
    /// Whether the Model reviews where each translation belongs.
    has_self_review: bool,
    /// Whether Speaker Labels are kept out of what the Model is sent.
    has_speaker_labels: bool,
    /// The positions of the Segments translated again, or none for every Segment.
    chosen_indexes: &'a [usize],
}

impl TranslationJob<'_> {
    /// `text` as the Model is sent it: its Speaker Labels kept apart when they are to be.
    fn labelled_text(&self, text: &str) -> LabelledText {
        match self.has_speaker_labels {
            true => LabelledText::split_labels(text),
            false => LabelledText::new(text),
        }
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct Translation {
    phases: Vec<PhaseTiming>,
    /// How many Segments of the original, retimed while it was translated, find no cue at their
    /// times in what was written.
    unmatched_count: usize,
}

/// Which llama-server a translation runs on.
pub enum LlamaServer<'a> {
    /// One started for this translation alone, stopped when it ends.
    Job,
    /// The Resident llama-server, freeing its Model `keep` after the translation ends.
    Router {
        resident: &'a ResidentLlama,
        preset_dir: &'a Path,
        keep: Duration,
    },
}

/// The llama-server a translation with `settings` runs on: the Resident llama-server, keeping
/// its Model for the chosen seconds, unless it is turned off.
pub fn llama_server<'a>(
    settings: &TranslationSettings,
    resident: &'a ResidentLlama,
    preset_dir: &'a Path,
) -> LlamaServer<'a> {
    if settings.has_resident_llama {
        LlamaServer::Router {
            resident,
            preset_dir,
            keep: Duration::from_secs(settings.model_keep_seconds),
        }
    } else {
        LlamaServer::Job
    }
}

/// The Translate Mode on the Current Resource: translates its Primary Language subtitle, whole or
/// its chosen Segments, as `plan` asks, on `server`.
pub struct TranslateMode<'a> {
    pub llama: &'a Path,
    pub model_settings: &'a ModelSettings,
    pub plan: &'a TranslationPlan,
    pub server: &'a LlamaServer<'a>,
    pub ready_timeout: Duration,
}

impl Mode for TranslateMode<'_> {
    const NAME: &'static str = "translate";
    type Target = TranslationSource;
    type Outcome = Translation;

    fn hold<'p>(
        &self,
        project: &'p CurrentProject,
    ) -> Result<(TranslationSource, ResourceHold<'p>), Failure> {
        project.hold_for_translation(
            self.plan.target,
            self.plan.scope.indexes().map(<[usize]>::to_vec),
        )
    }

    async fn run<'a, P: Progress + Steps + Sync>(
        &self,
        run: &ModeRun<'a, P>,
        project: &'a CurrentProject,
        source: TranslationSource,
        mut phases: Phases,
    ) -> Result<Translation, Failure> {
        let TranslateMode {
            llama,
            model_settings,
            plan,
            server,
            ready_timeout,
        } = *self;
        let model_settings = model_settings
            .clone()
            .with_project_model(ModelSlot::Translation, source.model.clone());
        let model = model_settings.ready_path(ModelSlot::Translation)?;
        let ports = run.ports();
        let languages = LanguagePair {
            source: source.language,
            target: plan.target,
        };
        let glossary_terms = project
            .reload_translation_glossary()?
            .map_or_else(Vec::new, |glossary| glossary.terms_for(languages));
        let job = TranslationJob {
            segments: &source.transcript.segments,
            languages,
            settings: plan.settings,
            has_speaker_labels: plan.options.has_speaker_labels,
            has_self_review: plan.options.has_self_review,
            summary_word_limit: plan.options.summary_word_limit,
            glossary_terms: &glossary_terms,
            chosen_indexes: plan.scope.indexes().unwrap_or_default(),
        };
        enter(ports, &mut phases, Phase::Loading);
        let is_cleaned = plan.is_simplified_cleaned();
        let on_batch = batch_display(ports, project, &source, is_cleaned);
        let result = match server {
            LlamaServer::Job => {
                translate_on_job_server(
                    ports,
                    llama,
                    &model,
                    ready_timeout,
                    &job,
                    &mut phases,
                    on_batch,
                )
                .await
            }
            LlamaServer::Router {
                resident,
                preset_dir,
                keep,
            } => {
                let result = async {
                    let base_url = resident
                        .load_model(ports, llama, &model, preset_dir, ready_timeout)
                        .await?;
                    translate_once_ready(
                        ports,
                        &base_url,
                        ready_timeout,
                        || false,
                        &job,
                        &mut phases,
                        on_batch,
                    )
                    .await
                }
                .await;
                resident.release_after(*keep).await;
                result
            }
        };
        let unmatched_count =
            write_translated_segments(project, &source, plan, result?, is_cleaned)?.unmatched_count;
        ports.announce_project();
        Ok(Translation {
            phases: phases.finish(),
            unmatched_count,
        })
    }

    /// A cancelled translation leaves the Resident llama-server running, so its Model is freed as
    /// after any other translation.
    async fn release_cancelled(&self) {
        if let LlamaServer::Router { resident, keep, .. } = self.server {
            resident.release_after(*keep).await;
        }
    }
}

/// Writes the Segments translated into `plan.target`, cleaned of Simplified Chinese when
/// `is_cleaned`: every translation, or those of the chosen Segments when translating them again.
fn write_translated_segments(
    project: &CurrentProject,
    source: &TranslationSource,
    plan: &TranslationPlan,
    mut translated_segments: Vec<Segment>,
    is_cleaned: bool,
) -> Result<Restoration, Failure> {
    if is_cleaned {
        clean_translations(&mut translated_segments);
    }
    match plan.scope.indexes() {
        None => project.write_translations(source, plan.target, translated_segments),
        Some(indexes) => {
            project.write_retranslations(source, plan.target, indexes, translated_segments)
        }
    }
}

/// Starts llama-server with `model` for this translation alone, translates once it is ready, and stops it.
async fn translate_on_job_server(
    ports: &(impl Progress + Steps),
    llama: &Path,
    model: &Path,
    ready_timeout: Duration,
    job: &TranslationJob<'_>,
    phases: &mut Phases,
    on_batch: impl Fn(&[Segment], Option<SegmentSpan>),
) -> Result<Vec<Segment>, Failure> {
    let port = llama::free_port()?;
    let server = ServerProcess::start(ports, llama, &llama::server_args(model, port))?;
    let result = translate_once_ready(
        ports,
        &llama::base_url(port),
        ready_timeout,
        || server.has_exited(),
        job,
        phases,
        on_batch,
    )
    .await;
    server.stop(ports);
    result
}

/// Shows the Segments translated so far on the Resource `source` was taken from, cleaned of
/// Simplified Chinese when `is_cleaned`, and tells the webview, so each Batch appears as it finishes.
fn batch_display<'a>(
    progress: &'a impl Progress,
    project: &'a CurrentProject,
    source: &'a TranslationSource,
    is_cleaned: bool,
) -> impl Fn(&[Segment], Option<SegmentSpan>) + 'a {
    move |translated_segments, pending_batch| {
        if is_cleaned {
            let mut cleaned_segments = translated_segments.to_vec();
            clean_translations(&mut cleaned_segments);
            project.show_translations(source, &cleaned_segments);
        } else {
            project.show_translations(source, translated_segments);
        }
        project.mark_pending_batch(pending_batch);
        progress.announce_project();
    }
}

/// Waits for llama-server to load its Model, then translates every Segment in the translate Phase,
/// handing `on_batch` the Segments translated so far and the Batch to translate next, before the
/// first Batch and after each.
async fn translate_once_ready(
    progress: &impl Progress,
    base_url: &str,
    ready_timeout: Duration,
    has_exited: impl Fn() -> bool,
    job: &TranslationJob<'_>,
    phases: &mut Phases,
    on_batch: impl Fn(&[Segment], Option<SegmentSpan>),
) -> Result<Vec<Segment>, Failure> {
    llama::wait_until_ready(base_url, ready_timeout, has_exited).await?;
    let model = TranslationModel::new(base_url);
    enter(progress, phases, Phase::Detection);
    let split_sentences = find_split_sentences(&model, job, |done_count, total| {
        progress.report_count(Phase::Detection, done_count, total)
    })
    .await;
    enter(progress, phases, Phase::Translation);
    if !job.chosen_indexes.is_empty() {
        let total = job.chosen_indexes.len();
        return translate_chosen_segments(
            &model,
            job,
            &split_sentences,
            |segments, pending_batch| {
                let done_count = pending_batch.map_or(total, |span| {
                    job.chosen_indexes
                        .partition_point(|index| *index < span.first)
                });
                if done_count > 0 {
                    progress.report_count(Phase::Translation, done_count, total);
                }
                on_batch(segments, pending_batch);
            },
        )
        .await;
    }
    translate_segments(
        &model,
        job,
        &split_sentences,
        |translated_segments, pending_batch| {
            if !translated_segments.is_empty() {
                progress.report_count(
                    Phase::Translation,
                    translated_segments.len(),
                    job.segments.len(),
                );
            }
            on_batch(translated_segments, pending_batch);
        },
    )
    .await
}

/// Asks the Model for Split Sentences window by window, over every Segment or, with chosen
/// Segments, over them and a Batch size of Segments on each side; a window it cannot answer is
/// skipped.
async fn find_split_sentences(
    model: &TranslationModel,
    job: &TranslationJob<'_>,
    on_progress: impl Fn(usize, usize),
) -> Vec<Vec<usize>> {
    let search_range = batching::search_range(
        job.segments.len(),
        job.settings.batch_size,
        job.chosen_indexes,
    );
    let windows = batching::windows(search_range.len(), job.settings.batch_size);
    let mut split_sentences = Vec::new();
    for (position, window) in windows.iter().enumerate() {
        let lines: Vec<(usize, &str)> = window
            .clone()
            .map(|position| search_range.start + position)
            .map(|index| (index, job.segments[index].text.as_str()))
            .collect();
        match model
            .find_split_sentences(job.languages.source, &lines)
            .await
        {
            Ok(sentences) => {
                for sentence in sentences {
                    if !split_sentences.contains(&sentence) {
                        split_sentences.push(sentence);
                    }
                }
            }
            Err(failure) => log::warn!("skipped a window looking for split sentences: {failure:?}"),
        }
        on_progress(position + 1, windows.len());
    }
    split_sentences
}

/// The Rolling Summary rewritten with a Batch's lines, or the previous one when the Model cannot answer.
async fn rewrite_summary(
    model: &TranslationModel,
    languages: LanguagePair,
    previous_summary: Option<String>,
    batch_pairs: &[(String, String)],
    word_limit: usize,
) -> Option<String> {
    match model
        .rewrite_summary(
            languages,
            previous_summary.as_deref(),
            batch_pairs,
            word_limit,
        )
        .await
    {
        Ok(summary) => Some(summary),
        Err(failure) => {
            log::warn!("kept the previous rolling summary: {failure:?}");
            previous_summary
        }
    }
}

/// Translates the chosen Segments again in Batches that keep each Split Sentence among them
/// whole, carrying the translated lines before them as reference, the source text of a Split
/// Sentence begun before the first of them, and the source lines after them; every other Segment
/// keeps its translation. `on_batch` is handed the Segments as they stand and the Batch to
/// translate next, before the first Batch and after each.
async fn translate_chosen_segments(
    model: &TranslationModel,
    job: &TranslationJob<'_>,
    split_sentences: &[Vec<usize>],
    on_batch: impl Fn(&[Segment], Option<SegmentSpan>),
) -> Result<Vec<Segment>, Failure> {
    let indexes = job.chosen_indexes;
    let (first, last) = (indexes[0], indexes[indexes.len() - 1]);
    let labelled_texts: Vec<LabelledText> = indexes
        .iter()
        .map(|index| job.labelled_text(&job.segments[*index].text))
        .collect();
    let mut translated_pairs: Vec<(String, String)> = job.segments[..first]
        .iter()
        .filter_map(|segment| {
            segment
                .translation
                .as_ref()
                .map(|translation| (segment.text.clone(), translation.clone()))
        })
        .collect();
    translated_pairs.drain(..translated_pairs.len().saturating_sub(CONTEXT_LINES));
    let preceding_text = sentence_head_text(job.segments, split_sentences, first);
    let following_lines: Vec<&str> = job.segments[last + 1..]
        .iter()
        .take(CONTEXT_LINES)
        .map(|segment| segment.text.as_str())
        .collect();
    let following_text = (!following_lines.is_empty()).then(|| following_lines.join(" "));
    let chosen_sentences = batching::chosen_sentences(split_sentences, indexes);
    let ranges = batching::batches(indexes.len(), job.settings.batch_size, &chosen_sentences);
    let span_at = |at: usize| {
        ranges.get(at).map(|range| SegmentSpan {
            first: indexes[range.start],
            last: indexes[range.end - 1],
        })
    };
    let mut segments = job.segments.to_vec();
    on_batch(&segments, span_at(0));
    for (at, range) in ranges.iter().cloned().enumerate() {
        let lines: Vec<(usize, &str)> = range
            .clone()
            .map(|position| {
                (
                    indexes[position],
                    labelled_texts[position].dialogue.as_str(),
                )
            })
            .collect();
        let is_last_batch = at + 1 == ranges.len();
        let translations = translate_lines(
            model,
            job,
            &lines,
            &mut translated_pairs,
            BatchSurroundings {
                summary: None,
                preceding_text: (at == 0).then_some(preceding_text.as_deref()).flatten(),
                following_text: is_last_batch.then_some(following_text.as_deref()).flatten(),
            },
        )
        .await?;
        for ((position, (index, _)), translation) in range.zip(lines).zip(translations) {
            if let Some(translation) = translation {
                segments[index].translation = Some(labelled_texts[position].reattach(&translation));
            }
        }
        on_batch(&segments, span_at(at + 1));
    }
    Ok(segments)
}

/// Translates one Batch of `lines`, each a Segment's index and its dialogue, after the lines in
/// `translated_pairs`, and answers each line's translation in order, none for a line the Model
/// left out; each line translated joins `translated_pairs`.
async fn translate_lines(
    model: &TranslationModel,
    job: &TranslationJob<'_>,
    lines: &[(usize, &str)],
    translated_pairs: &mut Vec<(String, String)>,
    surroundings: BatchSurroundings<'_>,
) -> Result<Vec<Option<String>>, Failure> {
    let answer = repair::translate_batch(model, job, lines, translated_pairs, surroundings).await?;
    Ok(lines
        .iter()
        .map(|(index, dialogue)| {
            let translation = answer.get(index).cloned();
            if let Some(translation) = &translation {
                translated_pairs.push((dialogue.to_string(), translation.clone()));
            }
            translation
        })
        .collect())
}

/// The source text of the Split Sentence `first` goes on from, the part of it before `first`;
/// none when `first` starts its sentence.
fn sentence_head_text(
    segments: &[Segment],
    split_sentences: &[Vec<usize>],
    first: usize,
) -> Option<String> {
    let sentence = split_sentences
        .iter()
        .find(|sentence| sentence.contains(&first))?;
    let head: Vec<&str> = sentence
        .iter()
        .filter(|index| **index < first)
        .map(|index| segments[*index].text.as_str())
        .collect();
    (!head.is_empty()).then(|| head.join(" "))
}

/// Translates the Segments Batch by Batch, keeping each Split Sentence in one Batch,
/// each Batch carrying the last lines translated before it; `on_batch` is handed the Segments
/// translated so far and the Batch to translate next, before the first Batch and after each.
async fn translate_segments(
    model: &TranslationModel,
    job: &TranslationJob<'_>,
    split_sentences: &[Vec<usize>],
    on_batch: impl Fn(&[Segment], Option<SegmentSpan>),
) -> Result<Vec<Segment>, Failure> {
    let labelled_texts: Vec<LabelledText> = job
        .segments
        .iter()
        .map(|segment| job.labelled_text(&segment.text))
        .collect();
    let mut translated_segments: Vec<Segment> = Vec::with_capacity(job.segments.len());
    let mut translated_pairs: Vec<(String, String)> = Vec::new();
    let mut summary: Option<String> = None;
    let ranges = batching::batches(job.segments.len(), job.settings.batch_size, split_sentences);
    let span_at = |at: usize| {
        ranges.get(at).map(|range| SegmentSpan {
            first: range.start,
            last: range.end - 1,
        })
    };
    on_batch(&translated_segments, span_at(0));
    for (at, range) in ranges.iter().cloned().enumerate() {
        let lines: Vec<(usize, &str)> = range
            .clone()
            .map(|index| (index, labelled_texts[index].dialogue.as_str()))
            .collect();
        let translations = translate_lines(
            model,
            job,
            &lines,
            &mut translated_pairs,
            BatchSurroundings {
                summary: summary.as_deref(),
                ..BatchSurroundings::default()
            },
        )
        .await?;
        for ((index, _), translation) in lines.into_iter().zip(translations) {
            let translation = translation.ok_or_else(|| Failure::LlamaRequest {
                detail: format!("answered without line {index}"),
            })?;
            translated_segments.push(Segment {
                translation: Some(labelled_texts[index].reattach(&translation)),
                ..job.segments[index].clone()
            });
        }
        if let Some(word_limit) = job.summary_word_limit {
            let batch_pairs = &translated_pairs[translated_pairs.len() - range.len()..];
            summary = rewrite_summary(model, job.languages, summary, batch_pairs, word_limit).await;
        }
        on_batch(&translated_segments, span_at(at + 1));
    }
    Ok(translated_segments)
}

#[cfg(test)]
mod tests;
