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
