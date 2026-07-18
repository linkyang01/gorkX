fn main() {
    // Re-run when privacy strings change — they are embedded into the macOS binary.
    println!("cargo:rerun-if-changed=Info.plist");
    tauri_build::build()
}
