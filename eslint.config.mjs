import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["coverage/**", "node_modules/**", "playwright-report/**", "test-results/**", "docs/**"]
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    rules: {}
  }
];
