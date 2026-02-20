// server/worker.ts
import { Worker } from 'bullmq';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const connectionOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
};

const LANGUAGE_CONFIG: any = {
    javascript: { image: "node:18-alpine", cmd: "node", ext: "js" },
    python: { image: "python:3.9-alpine", cmd: "python", ext: "py" },
    cpp: { image: "gcc:latest", cmd: "g++ -o /app/out /app/code.cpp && /app/out", ext: "cpp" }
};

console.log("👷 WORKER STARTED: Waiting for execution jobs...");

const worker = new Worker('code-execution', async (job) => {
    console.log(`[Job ${job.id}] Executing ${job.data.language} payload...`);
    
    const { code, language } = job.data;
    const config = LANGUAGE_CONFIG[language];

    if (!config) throw new Error("Unsupported Language");

    const filename = `code_${job.id}.${config.ext}`;
    const hostTempDir = path.join(__dirname, "temp");
    const hostFilePath = path.join(hostTempDir, filename);

    if (!fs.existsSync(hostTempDir)) fs.mkdirSync(hostTempDir);
    fs.writeFileSync(hostFilePath, code);

    const containerName = `worker_sandbox_${job.id}`;
    
    const dockerCmd = `docker run --name ${containerName} --rm -v "${hostTempDir}:/app" -w /app --network none --memory="128m" --cpus="0.5" ${config.image} sh -c "${config.cmd.replace('code.cpp', filename).replace(filename, filename)}"`;

    return new Promise((resolve) => {
        exec(dockerCmd, { timeout: 5000 }, (error, stdout, stderr) => {

            fs.unlink(hostFilePath, () => {});
            
            if (error) {

                exec(`docker kill ${containerName}`, () => {});
                resolve({ output: stderr || "Execution Timed Out / Killed" });
            } else {
                resolve({ output: stdout });
            }
        });
    });
}, { connection: connectionOptions });

worker.on('failed', (job, err) => {
    console.error(`[Job ${job?.id}] Failed completely: ${err.message}`);
});