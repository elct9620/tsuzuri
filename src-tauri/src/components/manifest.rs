#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveFormat {
    Zip,
    TarGz,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Archive {
    pub url: String,
    pub sha256: String,
    pub format: ArchiveFormat,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    /// Archives unpacked into one directory; `executable` is relative to it.
    Download {
        tag: String,
        archives: Vec<Archive>,
        executable: String,
    },
    /// Built by `scripts/vendor.sh`; `executable` is relative to `vendor/`.
    Vendored { executable: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub name: String,
    pub source: Source,
}

fn archive(url: &str, sha256: &str, format: ArchiveFormat) -> Archive {
    Archive {
        url: url.to_string(),
        sha256: sha256.to_string(),
        format,
    }
}

fn download(name: &str, tag: &str, archives: Vec<Archive>, executable: &str) -> Entry {
    Entry {
        name: name.to_string(),
        source: Source::Download {
            tag: tag.to_string(),
            archives,
            executable: executable.to_string(),
        },
    }
}

#[cfg(target_os = "macos")]
fn vendored(name: &str, executable: &str) -> Entry {
    Entry {
        name: name.to_string(),
        source: Source::Vendored {
            executable: executable.to_string(),
        },
    }
}

/// The Components this build needs, in the order a Mode runs them.
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
pub fn manifest() -> Vec<Entry> {
    use ArchiveFormat::Zip;
    vec![
        download(
            "ffmpeg",
            "autobuild-2026-08-31-13-27",
            vec![archive(
                "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-08-31-13-27/ffmpeg-n8.1.2-50-g1a748fe2cd-win64-lgpl-8.1.zip",
                "f6274bbd9c247f9e90c1bbed066b03ed4a3907cece2fb91be6dd352393936365",
                Zip,
            )],
            "ffmpeg-n8.1.2-50-g1a748fe2cd-win64-lgpl-8.1/bin/ffmpeg.exe",
        ),
        download(
            "whisper",
            "b5130",
            vec![archive(
                "https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-cublas-11.8.0-bin-x64.zip",
                "0b29b2175bb17ec26da29677cbc7c467c57d103245144d62a49a703f6bc3fdae",
                Zip,
            )],
            "Release/whisper-cli.exe",
        ),
        download(
            "llama",
            "b11149",
            vec![
                archive(
                    "https://github.com/ggml-org/llama.cpp/releases/download/b11149/llama-b11149-bin-win-cuda-12.4-x64.zip",
                    "d3140fe21ab2e665a706ca27923b27ca264f1c564b5837abea4566cc49c16096",
                    Zip,
                ),
                archive(
                    "https://github.com/ggml-org/llama.cpp/releases/download/b11149/cudart-llama-bin-win-cuda-12.4-x64.zip",
                    "8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6",
                    Zip,
                ),
            ],
            "llama-server.exe",
        ),
    ]
}

/// The Components this build needs, in the order a Mode runs them.
#[cfg(target_os = "macos")]
pub fn manifest() -> Vec<Entry> {
    #[cfg(target_arch = "aarch64")]
    let (llama_url, llama_sha256, llama_executable) = (
        "https://github.com/ggml-org/llama.cpp/releases/download/b11149/llama-b11149-bin-macos-arm64.tar.gz",
        "791eb0200a7c846ca925b6274fc21f0f21f537fda2924cc5a47402655816f56e",
        "llama-b11149/llama-server",
    );
    #[cfg(target_arch = "x86_64")]
    let (llama_url, llama_sha256, llama_executable) = (
        "https://github.com/ggml-org/llama.cpp/releases/download/b11149/llama-b11149-bin-macos-x64.tar.gz",
        "32f38e33825c2013c0ac9c0c9bdd9d5d6a4a96b3260a7e9b0ed3fc6679a1c270",
        "llama-b11149/llama-server",
    );
    vec![
        vendored("ffmpeg", "ffmpeg/bin/ffmpeg"),
        vendored("whisper", "whisper/bin/whisper-cli"),
        download(
            "llama",
            "b11149",
            vec![archive(llama_url, llama_sha256, ArchiveFormat::TarGz)],
            llama_executable,
        ),
    ]
}
