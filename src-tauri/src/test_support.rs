use std::fs;
use std::path::{Path, PathBuf};

/// A directory under the system temp dir, unique to this test process and removed when dropped.
pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new(name: &str) -> TempDir {
        let path = std::env::temp_dir().join(format!("tsuzuri-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        TempDir(path)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    pub fn file(&self, name: &str) -> PathBuf {
        let path = self.0.join(name);
        fs::write(&path, b"weights").unwrap();
        path
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Writes an executable script at `path` through a `cp` child rather than from this process.
/// On Linux, a child another test thread forks while this process holds the file open for
/// writing keeps that descriptor until it execs, and running the script meanwhile fails with
/// ETXTBSY; a file this process never opens for writing cannot be caught that way.
#[cfg(unix)]
pub fn write_executable(path: &Path, body: &str) {
    use std::os::unix::fs::PermissionsExt;

    let file_name = path.file_name().unwrap().to_string_lossy();
    let source = path.with_file_name(format!(".{file_name}.source"));
    fs::write(&source, body).unwrap();
    let copy_status = std::process::Command::new("cp")
        .arg(&source)
        .arg(path)
        .status()
        .unwrap();
    assert!(
        copy_status.success(),
        "cp could not write {}",
        path.display()
    );
    fs::remove_file(&source).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o755)).unwrap();
}

pub struct Request {
    pub path: String,
    pub body: Vec<u8>,
}

pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

/// An HTTP/1.1 server on a random local port answering each request with `handler`, one connection at a time.
pub struct FakeHttp {
    pub base_url: String,
}

impl FakeHttp {
    pub fn serve(handler: impl Fn(&Request) -> Response + Send + 'static) -> FakeHttp {
        use std::io::{BufRead, BufReader, Read, Write};

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(&stream);
                let mut request_line = String::new();
                if reader.read_line(&mut request_line).is_err() {
                    continue;
                }
                let path = request_line
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or_default()
                    .to_string();
                let mut headers = Vec::new();
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).is_err() || line.trim().is_empty() {
                        break;
                    }
                    if let Some((key, value)) = line.trim().split_once(':') {
                        headers.push((key.trim().to_string(), value.trim().to_string()));
                    }
                }
                let length = headers
                    .iter()
                    .find(|(key, _)| key.eq_ignore_ascii_case("content-length"))
                    .and_then(|(_, value)| value.parse().ok())
                    .unwrap_or(0usize);
                let mut body = vec![0; length];
                let _ = reader.read_exact(&mut body);
                let response = handler(&Request { path, body });
                let head = format!(
                    "HTTP/1.1 {} X\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    response.status,
                    response.body.len()
                );
                let mut stream = &stream;
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&response.body);
            }
        });
        FakeHttp { base_url }
    }
}

thread_local! {
    static LOGGED: std::cell::RefCell<Vec<String>> = const { std::cell::RefCell::new(Vec::new()) };
}

/// Keeps each log line on the thread that wrote it, so tests running in parallel read only their own.
struct CaptureLogger;

impl log::Log for CaptureLogger {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        LOGGED.with(|lines| lines.borrow_mut().push(record.args().to_string()));
    }

    fn flush(&self) {}
}

static CAPTURE_LOGGER: CaptureLogger = CaptureLogger;

/// The log lines `run` writes on the calling thread.
pub fn captured_logs(run: impl FnOnce()) -> Vec<String> {
    static INSTALL: std::sync::Once = std::sync::Once::new();
    INSTALL.call_once(|| {
        log::set_logger(&CAPTURE_LOGGER).unwrap();
        log::set_max_level(log::LevelFilter::Trace);
    });
    LOGGED.with(|lines| lines.borrow_mut().clear());
    run();
    LOGGED.with(|lines| lines.take())
}

/// Only Linux refuses to run a script another process holds open for writing.
#[cfg(all(test, target_os = "linux"))]
mod tests {
    use std::process::Command;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    use super::*;

    #[test]
    fn runs_a_written_executable_while_other_threads_fork() {
        let dir = TempDir::new("executable-busy");
        let is_done = Arc::new(AtomicBool::new(false));
        let forkers: Vec<_> = (0..2)
            .map(|_| {
                let is_done = Arc::clone(&is_done);
                std::thread::spawn(move || {
                    while !is_done.load(Ordering::Relaxed) {
                        let _ = Command::new("true").status();
                    }
                })
            })
            .collect();

        let busy_runs = (0..100)
            .filter(|attempt| {
                let tool = dir.path().join(format!("tool{attempt}"));
                write_executable(&tool, "#!/bin/sh\nexit 0\n");
                matches!(Command::new(&tool).status(), Err(error) if error.raw_os_error() == Some(26))
            })
            .count();
        is_done.store(true, Ordering::Relaxed);
        for forker in forkers {
            forker.join().unwrap();
        }

        assert_eq!(busy_runs, 0, "runs refused as a busy text file (ETXTBSY)");
    }
}
