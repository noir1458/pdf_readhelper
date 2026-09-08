import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "eslint.config.js"] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        chrome: "readonly",
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { "allowNumber": true }],
    },
  },
  {
    files: ["vite.config.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
