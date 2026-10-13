import { defaultPlugins } from '@hey-api/openapi-ts';

const config = {
  input: '../src/utils/swagger-generator/openapi-docs.json',
  output: 'src/lib/api/generated',
  plugins: [
    ...defaultPlugins,
    {
      name: '@hey-api/client-axios',
      // Base URL and API key live here; the generated client picks them up on init.
      runtimeConfigPath: './src/lib/api/config',
      // Matches `throwOnError: true` in createClientConfig, so the generated types
      // say what happens at runtime: a failed call throws, it never returns `error`.
      throwOnError: true,
    },
    '@hey-api/schemas',
    {
      dates: true,
      name: '@hey-api/transformers',
    },
    {
      enums: 'javascript',
      name: '@hey-api/typescript',
    },
    {
      name: '@hey-api/sdk',
      transformer: true,
    },
  ],
};

export default config;
