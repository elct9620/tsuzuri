//! The mruby archive `rake beni:build` stages links, and holds what mruby/build_config.rb sets.

use beni::Mrb;

fn value_of<T: beni::TryConvert>(source: &str) -> T {
    let mrb = Mrb::open().expect("mruby interpreter");
    mrb.eval(source).expect("evaluated source")
}

#[test]
fn counts_a_string_by_character() {
    assert_eq!(value_of::<i64>("'你好'.size"), 2);
}

#[test]
fn formats_with_sprintf() {
    assert_eq!(value_of::<String>("format('%03d', 7)"), "007");
}

#[test]
fn defines_data() {
    assert_eq!(value_of::<i64>("Data.define(:a).new(a: 1).a"), 1);
}

#[test]
fn leaves_out_files() {
    assert!(!value_of::<bool>(
        "Object.const_defined?(:File) || Object.const_defined?(:IO)"
    ));
}
