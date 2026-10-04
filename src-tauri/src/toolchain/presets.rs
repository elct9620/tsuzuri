use serde::Serialize;

use super::ModelSlot;
use crate::model_source::ModelSource;

/// A Model Tsuzuri was verified with, offered by name so nobody has to know where to find it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct PresetModel {
    pub slot: ModelSlot,
    pub name: &'static str,
    pub quantization: &'static str,
    pub source: ModelSource,
    pub size: u64,
}

/// Models of one family kept in one Hugging Face Repository at one commit.
struct PresetFamily {
    slot: ModelSlot,
    name: &'static str,
    repo: &'static str,
    commit: &'static str,
    /// Quantization, file and size of each, in the order the settings offer them.
    files: &'static [(&'static str, &'static str, u64)],
}

const FAMILIES: [PresetFamily; 6] = [
    PresetFamily {
        slot: ModelSlot::Transcription,
        name: "Breeze-ASR-25",
        repo: "tsuzuri-app/Breeze-ASR-25-ggml",
        commit: "cf41205287fb5483317ce2d1d973ba7cac8fa750",
        files: &[
            ("q8_0", "ggml-breeze-asr-25-q8_0.bin", 1_656_129_691),
            ("q5_0", "ggml-breeze-asr-25-q5_0.bin", 1_080_732_091),
            ("f16", "ggml-breeze-asr-25.bin", 3_094_623_691),
        ],
    },
    PresetFamily {
        slot: ModelSlot::Transcription,
        name: "Whisper large-v3-turbo",
        repo: "ggerganov/whisper.cpp",
        commit: "5359861c739e955e79d9a303bcbc70fb988958b1",
        files: &[
            ("q8_0", "ggml-large-v3-turbo-q8_0.bin", 874_188_075),
            ("q5_0", "ggml-large-v3-turbo-q5_0.bin", 574_041_195),
            ("f16", "ggml-large-v3-turbo.bin", 1_624_555_275),
        ],
    },
    PresetFamily {
        slot: ModelSlot::Transcription,
        name: "Whisper large-v3",
        repo: "ggerganov/whisper.cpp",
        commit: "5359861c739e955e79d9a303bcbc70fb988958b1",
        files: &[("f16", "ggml-large-v3.bin", 3_095_033_483)],
    },
    PresetFamily {
        slot: ModelSlot::Vad,
        name: "Silero",
        repo: "ggml-org/whisper-vad",
        commit: "9ffd54a1e1ee413ddf265af9913beaf518d1639b",
        files: &[("v6.2.0", "ggml-silero-v6.2.0.bin", 885_098)],
    },
    PresetFamily {
        slot: ModelSlot::Translation,
        name: "Qwen3-4B-Instruct-2507",
        repo: "unsloth/Qwen3-4B-Instruct-2507-GGUF",
        commit: "a06e946bb6b655725eafa393f4a9745d460374c9",
        files: &[
            (
                "Q4_K_M",
                "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
                2_497_281_120,
            ),
            ("Q8_0", "Qwen3-4B-Instruct-2507-Q8_0.gguf", 4_280_405_600),
        ],
    },
    PresetFamily {
        slot: ModelSlot::Diarization,
        name: "Nemotron-3-Diarization",
        repo: "nvidia/Nemotron-3-Diarization",
        commit: "f667ed73aee57d40cc39428eb768b4fd87a0a29e",
        files: &[("q8_0", "Nemotron-3-Diarization.q8_0.gguf", 107_012_128)],
    },
];

/// The Preset Models, in the order the settings offer them.
pub fn catalog() -> Vec<PresetModel> {
    FAMILIES
        .iter()
        .flat_map(|family| {
            family
                .files
                .iter()
                .map(move |&(quantization, file, size)| PresetModel {
                    slot: family.slot,
                    name: family.name,
                    quantization,
                    source: ModelSource::Repository {
                        repo: family.repo.to_string(),
                        file: file.to_string(),
                        commit: family.commit.to_string(),
                    },
                    size,
                })
        })
        .collect()
}

/// The Preset Models of `slot`, in the order the settings offer them.
pub fn slot_presets(slot: ModelSlot) -> Vec<PresetModel> {
    catalog()
        .into_iter()
        .filter(|preset| preset.slot == slot)
        .collect()
}

/// Where `source` stands among `slot`'s Preset Models, or none when it is none of them; the settings
/// choose the Preset Model a Model is by this place rather than comparing Model Sources themselves.
pub fn preset_index(slot: ModelSlot, source: &ModelSource) -> Option<usize> {
    slot_presets(slot)
        .iter()
        .position(|preset| preset.source == *source)
}

#[cfg(test)]
mod tests {
    use super::*;

    // @behavior MD-031
    #[test]
    fn offers_a_slot_only_its_own_preset_models_in_the_catalog_order() {
        let transcription_presets: Vec<_> = catalog()
            .into_iter()
            .filter(|preset| preset.slot == ModelSlot::Transcription)
            .collect();

        let offered = slot_presets(ModelSlot::Transcription);

        assert_eq!(
            (offered.len() < catalog().len(), offered),
            (true, transcription_presets)
        );
    }

    // @behavior MD-049
    #[test]
    fn places_a_preset_model_among_its_slot_and_a_file_nowhere() {
        let second = slot_presets(ModelSlot::Translation)[1].source.clone();
        let own_file = ModelSource::File {
            path: "/models/qwen3-4b.gguf".into(),
        };

        assert_eq!(
            (
                preset_index(ModelSlot::Translation, &second),
                preset_index(ModelSlot::Transcription, &second),
                preset_index(ModelSlot::Translation, &own_file),
            ),
            (Some(1), None, None)
        );
    }

    // @behavior MD-029
    #[test]
    fn offers_only_preset_models_their_slot_can_load() {
        let presets = catalog();

        let unloadable: Vec<_> = presets
            .iter()
            .filter(|preset| match &preset.source {
                ModelSource::Repository { file, .. } => !preset.slot.is_model_file(file),
                ModelSource::File { .. } => true,
            })
            .collect();
        let slots_without_one: Vec<_> = [
            ModelSlot::Transcription,
            ModelSlot::Vad,
            ModelSlot::Translation,
            ModelSlot::Diarization,
        ]
        .into_iter()
        .filter(|slot| presets.iter().all(|preset| preset.slot != *slot))
        .collect();
        assert_eq!((unloadable, slots_without_one), (vec![], vec![]));
    }

    // @behavior MD-030
    #[test]
    fn pins_every_preset_model_at_a_commit() {
        let unpinned_presets: Vec<_> = catalog()
            .into_iter()
            .filter(|preset| {
                !matches!(&preset.source, ModelSource::Repository { commit, .. }
                    if commit.len() == 40 && commit.chars().all(|c| c.is_ascii_hexdigit()))
            })
            .collect();

        assert_eq!(unpinned_presets, vec![]);
    }
}
