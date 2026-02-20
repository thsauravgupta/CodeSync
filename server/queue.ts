// server/queue.ts
import { Queue, QueueEvents } from 'bullmq';

const connectionOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null, 
};


export const codeQueue = new Queue('code-execution', { connection: connectionOptions });

export const queueEvents = new QueueEvents('code-execution', { connection: connectionOptions });