# tsuzuri-api: 1.0

# Merges each run of consecutive Segments said by one Speaker into one Segment, so an interview
# reads one turn at a time. With Segments checked, only runs among the checked ones are merged.
# Each Language's texts are joined with "，" in Chinese and ", " otherwise.

JOINERS = { "zh-TW" => "，" }.freeze

Tsuzuri.macro :merge_runs, label: "Merge a Speaker's runs" do |context|
  context.edit do |snapshot|
    targets = snapshot.checked.empty? ? (0...snapshot.segments.size).to_a : snapshot.checked
    positioned = snapshot.segments.zip((0...snapshot.segments.size).to_a)
    runs = positioned.chunk_while do |(a, i), (b, j)|
      a.speaker && a.speaker == b.speaker && targets.include?(i) && targets.include?(j)
    end
    runs.map do |run|
      segments = run.map(&:first)
      next segments.first if segments.size == 1

      texts = snapshot.languages.to_h do |language|
        [language, segments.filter_map { |segment| segment.texts[language] }.join(JOINERS.fetch(language, ", "))]
      end
      segments.first.with(end_ms: segments.map(&:end_ms).max, texts: texts.reject { |_, text| text.empty? })
    end
  end
end
