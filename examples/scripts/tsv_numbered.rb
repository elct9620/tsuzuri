# tsuzuri-api: 1.0

# Writes the transcript as a table to paste into a spreadsheet: one row a Segment, its Speaker
# numbered on their own count (Speaker 1-001, Speaker 1-002, Speaker 2-001), then its text in each
# Language. A line break inside a text becomes a space, so a Segment stays on one row. Without
# Speakers, rows are numbered on one count.

def cell(text)
  (text || "").split("\n").join(" ").split("\t").join(" ")
end

Tsuzuri.format :tsv_numbered, label: "TSV (numbered)", extension: "tsv" do |snapshot, options|
  counts = Hash.new(0)
  header = ["#", *snapshot.languages].join("\t")
  rows = snapshot.segments.map do |segment|
    speaker = options[:speakers] ? segment.speaker : nil
    name = speaker && (options[:speaker_names][speaker] || speaker)
    counts[name] += 1
    number = format("%03d", counts[name])
    id = name ? "#{name}-#{number}" : number
    [id, *snapshot.languages.map { |language| cell(segment.texts[language]) }].join("\t")
  end
  ([header] + rows).join("\n") + "\n"
end
