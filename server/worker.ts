// server/worker.ts
import { Worker } from 'bullmq';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { workerLogger } from './utils/logger';


const connectionOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null, // Required by BullMQ
};


const LANGUAGE_CONFIG: any = {
    javascript: { image: "node:18-alpine", cmd: "node", ext: "js" },
    python: { image: "python:3.9-alpine", cmd: "python", ext: "py" },
    cpp: { image: "gcc:latest", cmd: "g++ -o /app/out /app/code.cpp && /app/out", ext: "cpp" }
};


workerLogger.info("Worker node initialized and listening for execution jobs");


const worker = new Worker('code-execution', async (job) => {
    

    workerLogger.info("Executing job payload", { 
        jobId: job.id, 
        language: job.data.language 
    });
    
    const { code, language } = job.data;
    const config = LANGUAGE_CONFIG[language];

    if (!config) {
        throw new Error(`Unsupported Language: ${language}`);
    }

    const filename = `code_${job.id}.${config.ext}`;
    const hostTempDir = path.join(__dirname, "temp");
    const hostFilePath = path.join(hostTempDir, filename);

    if (!fs.existsSync(hostTempDir)) fs.mkdirSync(hostTempDir);
    fs.writeFileSync(hostFilePath, code);

    const containerName = `worker_sandbox_${job.id}`;
    

    const dockerCmd = `docker run --name ${containerName} --rm -v "${hostTempDir}:/app" -w /app --network none --memory="128m" --cpus="0.5" ${config.image} sh -c "${config.cmd.replace('code.cpp', filename).replace(filename, filename)}"`;

    return new Promise((resolve) => {
        const startTime = Date.now();

        exec(dockerCmd, { timeout: 5000 }, (error, stdout, stderr) => {
            const duration = Date.now() - startTime;

            fs.unlink(hostFilePath, () => {});
            
            if (error) {

                exec(`docker kill ${containerName}`, () => {});
                
                workerLogger.error("Job execution encountered an error/timeout", {
                    jobId: job.id,
                    durationMs: duration,
                    error: stderr || error.message
                });

                resolve({ output: stderr || "Execution Timed Out / Killed due to infinite loop." });
            } else {
                workerLogger.info("Job execution completed successfully", {
                    jobId: job.id,
                    durationMs: duration,
                    outputLength: stdout.length
                });

                resolve({ output: stdout });
            }
        });
    });
}, { connection: connectionOptions });


worker.on('completed', (job) => {
    workerLogger.info("Job fully processed by BullMQ", { jobId: job.id });
});

worker.on('failed', (job, err) => {
    workerLogger.error("Job failed completely", { 
        jobId: job?.id, 
        error: err.message 
    });
});