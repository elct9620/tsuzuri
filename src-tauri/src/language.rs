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

/// The Languages a translation goes from and into.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LanguagePair {
    pub source: Language,
    pub target: Language,
}

impl Language {
    pub const ALL: [Language; 3] = [
        Language::TraditionalChinese,
        Language::English,
        Language::Japanese,
    ];

    /// The code the webview sends, and export file names carry.
    pub fn code(self) -> &'static str {
        match self {
            Language::TraditionalChinese => "zh-TW",
            Language::English => "en",
            Language::Japanese => "ja",
        }
    }

    /// The Language a code names, such as the one a subtitle's file name carries.
    pub fn from_code(code: &str) -> Option<Language> {
        Language::ALL
            .into_iter()
            .find(|language| language.code() == code)
    }

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
