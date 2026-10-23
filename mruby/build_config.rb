# frozen_string_literal: true

# The interpreter scripts run in: strings and collections only. The I/O gems (stdlib-io) are left
# out, so a script reaches no file, network, environment or process.
MRuby::Lockfile.disable

MRuby::Build.new do |conf|
  # clang on macOS, gcc on Linux, visualcpp inside an MSVC developer environment on Windows.
  conf.toolchain

  conf.gembox "stdlib"
  conf.gem core: "mruby-sprintf"
  conf.gem core: "mruby-data"
  conf.gem core: "mruby-compiler"

  # Strings index by character, so Chinese text is split by character rather than by byte.
  conf.cc.defines << "MRB_UTF8_STRING"
end
