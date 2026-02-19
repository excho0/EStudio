import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json"],
        },
      },
      "import/ignore": ["^server-only$"],
      "import/core-modules": ["server-only"],
    },
    rules: {
      "import/no-unresolved": "error",
    },
  },
  {
    files: [
      "src/app/**/renders/**/page.tsx",
      "src/app/**/library/page.tsx",
      "src/app/**/publishes/**/page.tsx",
      "src/components/publishing/publish-drawer.tsx",
    ],
    rules: {
      "react-hooks/incompatible-library": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Runtime-generated/cache artifacts:
    "data/cache/**",
    "data/tmp/**",
  ]),
]);

export default eslintConfig;
