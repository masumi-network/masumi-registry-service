import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores(['.next/**', 'dist/**', 'node_modules/**']),
  {
    ignores: ['**/*.gen.ts', 'src/lib/api/generated/**'],
  },
]);

export default eslintConfig;
