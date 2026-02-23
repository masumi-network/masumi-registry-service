import { createLogger, format, transports } from 'winston';
import { TransformableInfo } from 'logform';

const { combine, timestamp, errors, json } = format;

const serializeErrors = format((info: TransformableInfo) => {
  for (const key of Object.keys(info)) {
    if (info[key] instanceof Error) {
      const err = info[key] as Error;
      info[key] = {
        ...err,
        message: err.message,
        stack: err.stack,
      };
    }
  }
  return info;
});

function buildProdLogger() {
  return createLogger({
    format: combine(
      timestamp(),
      errors({ stack: true }),
      serializeErrors(),
      json()
    ),
    defaultMeta: { service: 'registry-service' },
    transports: [new transports.Console()],
  });
}

export { buildProdLogger };
