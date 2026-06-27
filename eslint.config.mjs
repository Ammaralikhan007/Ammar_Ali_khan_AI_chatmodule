// ESLint 9 flat config.
//
// Layers (later entries win):
//   1. eslint:recommended            — core JS correctness rules.
//   2. typescript-eslint recommended — TS-aware rules (also disables core
//      rules TS already covers, like no-undef).
//   3. eslint-config-prettier        — turns OFF all formatting rules so
//      Prettier owns formatting and the two never fight.
//
// Run: `npm run lint` (report) / `npm run lint:fix` (autofix).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Allow intentionally-unused args when prefixed with `_` (e.g. Express
      // `_req`), and trailing unused args like the error handler's `next`.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // We deliberately use `unknown` over `any`; keep this off for the few
      // places where broad typing is pragmatic.
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
