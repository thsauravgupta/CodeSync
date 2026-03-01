
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';


export const schemas = {

    executePayload: z.object({
        code: z.string().min(1, "Code cannot be empty").max(50000, "Code exceeds 50KB limit"),
        // Only allow exact strings from our supported languages
        language: z.enum(['javascript', 'python', 'cpp']) 
    }),
    
    // For /register and /login
    authPayload: z.object({
        email: z.string().email("Invalid email format"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        name: z.string().optional() // Only required for register
    })
};

// 2. Generic validation middleware factory
export const validate = (schema: z.AnyZodObject) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            // Parses and strictly validates the request body
            req.body = schema.parse(req.body);
            next();
        } catch (error: any) {
            logger.warn("Payload validation failed", { 
                ip: req.ip, 
                path: req.path, 
                issues: error.issues 
            });
            
            return res.status(400).json({ 
                error: "Invalid Request Payload", 
                details: error.issues 
            });
        }
    };
};