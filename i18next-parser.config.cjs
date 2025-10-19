// i18next-parser.config.cjs
module.exports = {
  locales: ['en', 'zh', 'ms', 'ta'],
  input: [
    'app/**/*.{js,jsx,ts,tsx}',
    'src/**/*.{js,jsx,ts,tsx}',
    '!**/node_modules/**',
    '!locales/**',
  ],
  output: 'locales/$LOCALE.json',
  sort: true,
  keySeparator: '.',
  namespaceSeparator: false, // you’re using single-file locales like locales/en.json
  lexers: {
    js:  ['JavascriptLexer'],
    jsx: ['JsxLexer'],
    ts:  ['JavascriptLexer'], // <-- use JS lexer for .ts
    tsx: ['JsxLexer'],        // <-- use JSX lexer for .tsx
  },
};
