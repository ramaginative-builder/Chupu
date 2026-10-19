import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [
  { ignores: [".next/**", "node_modules/**", "_prototype-v0/**", "_to_delete/**", ".dev-media/**", ".dev-fixture/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Plain <img> with explicit width/height is allowed by the PRD (signed URLs, no remote image optimiser).
  { rules: { "@next/next/no-img-element": "off" } },
];
