import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Extend the shared zod instance with OpenAPI helpers once and re-export it.
extendZodWithOpenApi(z);

export { z };
