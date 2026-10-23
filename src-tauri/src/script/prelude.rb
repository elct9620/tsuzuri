# The script API a Script runs against. Keyword arguments and defaults live here, so the Rust side
# only reads what these methods record and the JSON they write.
module Tsuzuri
  class Error < StandardError; end

  Snapshot = Data.define(:primary, :languages, :segments, :checked)
  Segment = Data.define(:start_ms, :end_ms, :speaker, :texts)

  # mruby's Data has no `with`, which reads clearer than building each copy by hand.
  [Snapshot, Segment].each do |type|
    type.class_eval do
      def with(**changes)
        self.class.new(**to_h.merge(changes))
      end
    end
  end

  # What a Macro's block calls; each edit returns new Segments for Rust to check and write.
  class Context
    attr_reader :snapshot

    def initialize(snapshot)
      @snapshot = snapshot
      @edits = []
    end

    def edit
      segments = yield @snapshot
      return nil if segments.nil?
      unless segments.is_a?(Array) && segments.all? { |segment| segment.is_a?(Segment) }
        raise Error, "edit must return an Array of Tsuzuri::Segment or nil"
      end

      @edits << segments
      @snapshot = @snapshot.with(segments: segments, checked: [])
    end

    def __edits
      @edits
    end
  end

  @registrations = {}

  class << self
    def macro(id, label: id.to_s, &block)
      __register(id, { kind: "macro", id: id.to_s, label: label }, block)
    end

    def format(id, label: id.to_s, extension: "txt", &block)
      __register(id, { kind: "export-format", id: id.to_s, label: label, extension: extension }, block)
    end

    def __register(id, registration, block)
      raise Error, "#{registration[:kind]} id must be a Symbol" unless id.is_a?(Symbol)
      raise Error, "#{registration[:kind]} :#{id} needs a block" unless block
      raise Error, ":#{id} is registered twice" if @registrations.key?(id)

      @registrations[id] = [registration, block]
    end

    def __registrations_json
      __json(@registrations.values.map(&:first))
    end

    def __format_text(id, snapshot, options)
      text = __block(id, "export-format").call(snapshot, options)
      raise Error, "export format :#{id} must return a String" unless text.is_a?(String)

      text
    end

    def __macro_edits_json(id, snapshot)
      context = Context.new(snapshot)
      __block(id, "macro").call(context)
      __json(context.__edits.map { |segments| segments.map(&:to_h) })
    end

    def __block(id, kind)
      registration, block = @registrations[id.to_sym]
      raise Error, "no #{kind} :#{id}" unless registration && registration[:kind] == kind

      block
    end

    # mruby has no JSON or Regexp, so text is escaped one character at a time.
    def __json(value)
      case value
      when nil then "null"
      when true, false, Integer then value.to_s
      when Symbol then __json(value.to_s)
      when String then __json_string(value)
      when Array then "[#{value.map { |item| __json(item) }.join(",")}]"
      when Hash then "{#{value.map { |key, item| "#{__json(key.to_s)}:#{__json(item)}" }.join(",")}}"
      else raise Error, "cannot hand #{value.class} back to Tsuzuri"
      end
    end

    def __json_string(text)
      escaped = text.each_char.map do |char|
        case char
        when '"' then '\\"'
        when "\\" then "\\\\"
        else char.ord < 0x20 ? "\\u%04x" % char.ord : char
        end
      end
      "\"#{escaped.join}\""
    end
  end
end
