# 0001 Web search explicit `f32` literals

- **Upstream commit:** `7cfcb20d2b50b0d18801a6c0af2e401c0e060894`
- **Reason:** Rust currently accepts the four response-builder literals through
  fallback from `f64` to `f32`, but emits `float_literal_f32_fallback` as a
  future-incompatible warning. Explicit suffixes keep the same numeric values
  and make the locked source compatible with the forthcoming compiler change.
- **Affected ACP behavior:** none. This only changes type inference in the
  web-search tool request builder; no ACP request, permission, model selection,
  or response handling changes.
- **Risk:** low. `0.1` and `0.95` are already converted to `f32` by upstream;
  the patch records that conversion at the call site.
- **Regression command:**
  `GORKX_KERNEL_SOURCE=/path/to/grok-build scripts/build-grok-kernel.sh /private/tmp/grok && node scripts/verify-grok-acp.mjs /private/tmp/grok`
