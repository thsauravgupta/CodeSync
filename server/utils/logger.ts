// server/utils/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
    level: 'info',

    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'codesync-api' },
    transports: [

        new winston.transports.Console()
    ],
});


export const workerLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'codesync-worker' },
    transports: [
        new winston.transports.Console()
    ],
});