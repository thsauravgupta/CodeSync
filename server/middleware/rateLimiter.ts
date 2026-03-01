import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';

const redisClient = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 1
});

export const executeRateLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 5,
    standardHeaders: true, 
    legacyHeaders: false, 
    
    
    store: new RedisStore({
        // @ts-ignore 
        sendCommand: (...args: string[]) => redisClient.call(...args),
    }),

    
    handler: (req, res) => {
        logger.warn("Execution rate limit exceeded", { 
            ip: req.ip,
            path: req.path
        });
        
        res.status(429).json({
            output: " RATE LIMIT EXCEEDED: You are restricted to 5 executions per minute to prevent system abuse. Please wait."
        });
    }
});