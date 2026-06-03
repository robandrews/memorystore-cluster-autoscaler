import js from "@eslint/js";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["!**/.*", "**/node_modules/**", "configeditor/build/**"]),
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js, prettier },
    extends: ["js/recommended"],

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha,
      },
    },
  },
  {
    files: ["**/*.ts"],
    plugins: { prettier },
    extends: [tseslint.configs.recommended],

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha,
      },
      parser: tseslint.parser,
    },

    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-unused-vars": "off",
    },
  },
  { files: ["**/*.{js,ts}"], languageOptions: { sourceType: "commonjs" } },
]);
