import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  prettierConfig,
  globalIgnores(['.next/**', 'dist/**', 'node_modules/**', 'src/lib/api/generated/**']),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      // External links opened with target="_blank" must carry rel="noreferrer"
      // (or noopener) — prevents reverse-tabnabbing and referrer leakage.
      'react/jsx-no-target-blank': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSImportType',
          message:
            'Inline import() types are not allowed. Use a top-level import statement instead.',
        },
      ],
    },
  },
]);

export default eslintConfig;
