import ashNazg from 'eslint-config-ash-nazg';
import globals from 'globals';

export default [
  {
    ignores: [
      'src/data/**',
      // Fixture pages/scripts deliberately reproduce verbatim real-world
      // license text and tag conventions (including a literal `http://`
      // URL that's part of the actual Apache-2.0 license boilerplate),
      // so they shouldn't be made to satisfy this project's own style
      // rules.
      'tests/fixtures/**'
    ]
  },
  // `.map` copies each config object rather than mutating it in place (as
  // `addFiles` from `eslint-config-ash-nazg` does), since several of these
  // are shared singletons also reused by the `browser` preset below —
  // mutating them here would leak the `scripts/**` file restriction onto it.
  ...ashNazg(['sauron', 'node']).map((cfg) => ({
    ...cfg, files: ['scripts/**/*.js']
  })),
  ...ashNazg(['sauron', 'browser']),
  {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.webextensions
      }
    },
    rules: {
    }
  }
];
