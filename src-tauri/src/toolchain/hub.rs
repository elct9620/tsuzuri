use std::path::{Path, PathBuf};

/// The Hugging Face Cache, located the way Hugging Face's own tools locate it, so a Model they
/// downloaded is found. `variable_by_name` reads an environment variable; the home directory comes
/// from the platform, since hf-hub reads `HOME`, which Windows does not set.
pub fn hub_cache(variable_by_name: impl Fn(&str) -> Option<String>, home: &Path) -> PathBuf {
    let non_empty_value = |name: &str| variable_by_name(name).filter(|value| !value.is_empty());
    if let Some(cache) =
        non_empty_value("HF_HUB_CACHE").or_else(|| non_empty_value("HUGGINGFACE_HUB_CACHE"))
    {
        return PathBuf::from(cache);
    }
    let hf_home = non_empty_value("HF_HOME")
        .map(PathBuf::from)
        .or_else(|| {
            non_empty_value("XDG_CACHE_HOME").map(|cache| PathBuf::from(cache).join("huggingface"))
        })
        .unwrap_or_else(|| home.join(".cache").join("huggingface"));
    hf_home.join("hub")
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn variables(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let variables: HashMap<String, String> = pairs
            .iter()
            .map(|(name, value)| (name.to_string(), value.to_string()))
            .collect();
        move |name| variables.get(name).cloned()
    }

    // @behavior MD-016
    #[test]
    fn finds_the_hugging_face_cache_in_the_home_directory() {
        let home = Path::new("/home/user");

        let cache = hub_cache(variables(&[]), home);

        assert_eq!(cache, home.join(".cache").join("huggingface").join("hub"));
    }

    // @behavior MD-017
    #[test]
    fn takes_the_hugging_face_cache_a_variable_names() {
        let cache = hub_cache(
            variables(&[("HF_HUB_CACHE", "/models/hub"), ("HF_HOME", "/models/hf")]),
            Path::new("/home/user"),
        );

        assert_eq!(cache, PathBuf::from("/models/hub"));
    }
}
