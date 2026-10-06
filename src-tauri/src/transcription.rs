use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::Serialize;

use crate::cleanup::clean_texts;
use crate::conversion;
use crate::failure::Failure;
use crate::language::Language;
use crate::progress::{enter, Progress};
use crate::project::{
    CurrentProject, ResourceHold, SegmentSpan, TranscriptionRequest, TranscriptionTarget,
};
use crate::steps::{convert_speech, run_step, Mode, ModeRun, Steps, WorkDir, TRANSCRIPTION_STEP};
use crate::timing::Phase;
use crate::timing::{PhaseTiming, Phases};
use crate::toolchain::{ModelSettings, ModelSlot};
use crate::transcript::{Transcript, WrittenText};

pub mod commands;
pub mod settings;
mod whisper;

use settings::TranscriptionSettings;
use whisper::TranscriptionPlan;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct Transcription {
    #[specta(type = specta_typescript::Number)]
    audio_seconds: f64,
    #[specta(type = specta_typescript::Number)]
    transcribe_seconds: f64,
    phases: Vec<PhaseTiming>,
    /// The positions of the Segments written within an Audio Window, none for the whole media file.
    written_span: Option<SegmentSpan>,
}

pub struct Tools {
    pub ffmpeg: PathBuf,
    pub whisper: PathBuf,
}

/// The Transcribe Mode on the Current Resource: converts its media file, or the Audio Window
/// asked for, runs whisper-cli and writes what it heard as the Primary Language subtitle.
pub struct TranscribeMode<'a> {
    pub tools: &'a Tools,
    pub models: &'a ModelSettings,
    pub settings: TranscriptionSettings,
    pub request: TranscriptionRequest,
    pub work: &'a Path,
}

impl Mode for TranscribeMode<'_> {
    const NAME: &'static str = "transcribe";
    type Target = TranscriptionTarget;
    type Outcome = Transcription;

    fn hold<'p>(
        &self,
        project: &'p CurrentProject,
    ) -> Result<(TranscriptionTarget, ResourceHold<'p>), Failure> {
        project.hold_for_transcription(self.request)
    }

    async fn run<'a, P: Progress + Steps + Sync>(
        &self,
        run: &ModeRun<'a, P>,
        project: &'a CurrentProject,
        job: TranscriptionTarget,
        mut phases: Phases,
    ) -> Result<Transcription, Failure> {
        let TranscribeMode {
            tools,
            models,
            settings,
            work,
            ..
        } = *self;
        let ports = run.ports();
        let input = job.media.as_path();
        let models = models
            .clone()
            .with_project_model(ModelSlot::Transcription, job.model.clone());
        let settings = settings.with_overrides(job.overrides);
        let is_cleaned =
            settings.is_simplified_cleaned && job.language == Language::TraditionalChinese;
        let model = models.ready_path(ModelSlot::Transcription)?;
        let vad = settings
            .has_vad
            .then(|| models.ready_path(ModelSlot::Vad))
            .transpose()?;
        let plan = TranscriptionPlan {
            model: &model,
            vad: vad.as_deref(),
            language: job.language,
            settings,
        };
        run.keep(WorkDir::try_new(work)?);
        let wav = work.join("audio.wav");
        let srt_prefix = work.join("transcript");

        let audio_bytes =
            convert_speech(ports, &mut phases, &tools.ffmpeg, input, job.window, &wav).await?;

        enter(ports, &mut phases, Phase::Loading);
        let start = Instant::now();
        project.show_transcript(project.kept_segments(&job)?);
        ports.announce_project();
        run_step(
            ports,
            TRANSCRIPTION_STEP,
            &tools.whisper,
            &whisper::transcription_args(&plan, &wav, &srt_prefix),
            |line| {
                if line.starts_with(whisper::START_MARK) {
                    enter(ports, &mut phases, Phase::Transcription);
                } else if let Some(percent) = whisper::progress(line) {
                    ports.report(Phase::Transcription, Some(percent));
                }
            },
            |line| {
                if let Some(mut segment) = whisper::segment(line) {
                    if is_cleaned {
                        clean_texts(std::slice::from_mut(&mut segment));
                    }
                    project.push_segment(match job.window {
                        Some(window) => window.segment_in_media(segment),
                        None => segment,
                    });
                    ports.announce_project();
                }
            },
        )
        .await?;
        let transcribe_seconds = start.elapsed().as_secs_f64();

        let mut srt = std::fs::read_to_string(srt_prefix.with_extension("srt"))?;
        // What whisper-cli wrote must read as a Transcript before it replaces the subtitle.
        let mut transcript = Transcript::from_srt(&srt)?;
        if is_cleaned {
            clean_texts(&mut transcript.segments);
            srt = transcript.to_srt(WrittenText::Original);
        }
        let written_span = project.write_transcription(&job, srt)?;
        ports.announce_project();
        Ok(Transcription {
            audio_seconds: conversion::audio_seconds(audio_bytes),
            transcribe_seconds,
            phases: phases.finish(),
            written_span,
        })
    }
}

#[cfg(all(test, unix))]
mod tests;
