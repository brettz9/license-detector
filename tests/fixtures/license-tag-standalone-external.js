// @license magnet:?xt=urn:btih:8e4f440f4c65981c5bf93c76d35135ba5064d8b7&dn=apache-2.0.txt Apache-2.0
//
// This is the exact convention used by Google's prettify.js as loaded by
// GNU's own librejs "free-your-javascript.html" page: a bare `@license`
// tag with no `@licstart`/`@licend` wrapper at all, closed by
// `@license-end` rather than `@licend`. Before the detector.js fix, this
// tag was only ever searched for *inside* a `@licstart...@licend` block,
// so a standalone tag like this one was silently ignored.
function greet () {
  return 'hello from a standalone-@license-tagged script';
}
greet();
// @license-end
