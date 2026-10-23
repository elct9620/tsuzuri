# frozen_string_literal: true

require "beni/tasks"

# `rake beni:build` builds the mruby archive scripts run in. It stays out of vendor/, which the
# bundle copies whole into the installer; src-tauri/.cargo/config.toml points the beni crate here.
Beni::Tasks.new do
  version "4.0.0"
  build_config "mruby/build_config.rb"
  vendor_dir "mruby/.build"
end
