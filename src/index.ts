import 'dotenv/config';
import { CONFIG } from '@/utils/config/';
import { logger } from '@/utils/logger/';
import initSchedules from '@/services/schedules';
import { createConfig, createServer } from 'express-zod-api';
import { router } from '@/routes/index';
import ui, { JsonObject } from 'swagger-ui-express';
import express from 'express';
import { generateOpenAPI } from '@/utils/swagger-generator';
import { cleanupDB, initDB } from '@/utils/db';
import { readFileSync } from 'fs';
import { join } from 'path';

async function initialize() {
  await initDB();
  initSchedules();
}

initialize()
  .then(async () => {
    const PORT = CONFIG.PORT;
    const serverConfig = createConfig({
      inputSources: {
        get: ['query', 'params'],
        post: ['body', 'params'],
        put: ['body', 'params'],
        patch: ['body', 'params'],
        delete: ['body', 'params'],
      },
      startupLogo: false,

      beforeRouting: ({ app }) => {
        const docs = generateOpenAPI();
        const docsString = JSON.stringify(docs, undefined, 4);

        // Serve static assets from public/assets folder
        // Works in both dev (public) and production (dist/public)
        const assetsPathProd = join(process.cwd(), 'dist/public/assets');
        const assetsPathDev = join(process.cwd(), 'public/assets');
        app.use('/assets', express.static(assetsPathProd));
        app.use('/assets', express.static(assetsPathDev));

        // Load custom CSS - works in both dev and production
        // Try dist first (production), then public (development)
        let customCss = '';
        try {
          customCss = readFileSync(
            join(process.cwd(), 'dist/public/assets/swagger-custom.css'),
            'utf8'
          );
        } catch {
          try {
            customCss = readFileSync(
              join(process.cwd(), 'public/assets/swagger-custom.css'),
              'utf8'
            );
          } catch (error) {
            logger.warn('Could not load custom Swagger CSS', error);
          }
        }

        logger.info(
          '************** Now serving the API documentation at localhost:' +
            PORT +
            '/docs **************'
        );
        app.use(
          '/docs',
          ui.serve,
          ui.setup(JSON.parse(docsString) as JsonObject, {
            explorer: false,
            customSiteTitle: 'Registry Service API Documentation',
            customfavIcon: '/assets/swagger_favicon.svg',
            customCss: customCss,
            swaggerOptions: {
              persistAuthorization: true,
              tryItOutEnabled: true,
            },
          })
        );
        app.get('/api-docs', (_, res) => {
          res.json(JSON.parse(docsString));
        });
      },
      http: {
        listen: PORT,
      },
      cors: ({ defaultHeaders }) => ({
        ...defaultHeaders,
        'Access-Control-Max-Age': '5000',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'Content-Range, X-Total-Count',
      }),
      logger: logger,
    });
    createServer(serverConfig, router);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      try {
        logger.info(`Received ${signal}. Shutting down gracefully...`);
        await cleanupDB();
      } catch (e) {
        logger.error('Error during shutdown', e);
      } finally {
        process.exit(0);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })
  .catch((e) => {
    throw e;
  });
