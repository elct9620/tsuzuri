use serde::{Deserialize, Serialize};

/// A language Tsuzuri transcribes from or translates into; the webview sends only its code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Language {
    #[serde(rename = "zh-TW")]
    TraditionalChinese,
    #[serde(rename = "en")]
    English,
    #[serde(rename = "ja")]
    Japanese,
}

impl Language {
    /// The name a Model is told the language by.
    pub fn name(self) -> &'static str {
        match self {
            Language::TraditionalChinese => "Traditional Chinese (Taiwan)",
            Language::English => "English",
            Language::Japanese => "Japanese",
        }
    }

    /// The code whisper-cli's `-l` takes.
    pub fn whisper_code(self) -> &'static str {
        match self {
            Language::TraditionalChinese => "zh",
            Language::English => "en",
            Language::Japanese => "ja",
        }
    }
}
