import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { YSocketIO } from "y-socket.io/dist/server";
import fs from "fs";
import path from "path";
import { exec } from "child_process"; 

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// --- Yjs & Socket.io Setup ---
const io = new Server(server, { cors: { origin: "*" } });
const ysocketio = new YSocketIO(io, {});
ysocketio.initialize();

// --- Docker Execution Engine ---

// 1. Config: Which docker image to use for which language
const LANGUAGE_CONFIG: any = {
    javascript: {
        image: "node:18-alpine",
        cmd: "node",      // Command to run inside container
        ext: "js"         // File extension
    },
    python: {
        image: "python:3.9-alpine",
        cmd: "python",
        ext: "py"
    }
};

app.post("/execute", (req, res) => {
    const { code, language } = req.body;
    const config = LANGUAGE_CONFIG[language];

    if (!config) {
        return res.status(400).json({ output: "Language not supported" });
    }

    // 2. Prepare the file
    // We create a unique name so multiple users don't overwrite each other
    const filename = `code_${Date.now()}.${config.ext}`;
    
    // Absolute path to the 'temp' folder on YOUR computer
    const hostTempDir = path.join(__dirname, "temp");
    const hostFilePath = path.join(hostTempDir, filename);

    // Write the code to a file
    if (!fs.existsSync(hostTempDir)) fs.mkdirSync(hostTempDir);
    fs.writeFileSync(hostFilePath, code);

    console.log(`Saved code to: ${hostFilePath}`);

    // 3. Build the Docker Command (The Magic)
    // --rm: Remove container immediately after running (saves memory)
    // -v: Volume Mount. Maps your host folder to the container's /app folder
    // -w: Set working directory inside container
    // --network none: DISABLE INTERNET (Prevents users from downloading malware)
    // timeout 5s: Kill process if it runs too long (prevents infinite loops)
    
    // NOTE: On Windows, use absolute paths for volumes, or %cd% if running from cmd. 
    // We use the 'hostTempDir' variable which handles the path correctly.
    
    const dockerCmd = `docker run --rm -v "${hostTempDir}:/app" -w /app --network none ${config.image} ${config.cmd} ${filename}`;

    console.log(`Executing: ${dockerCmd}`);

    // 4. Run the command using Node's child_process
    exec(dockerCmd, { timeout: 5000 }, (error, stdout, stderr) => {
        
        // Cleanup: Delete the file from your computer
        fs.unlink(hostFilePath, () => {});

        if (error) {
            // Check if it was a timeout (Infinite Loop)
            if (error.killed) {
                return res.json({ output: "Error: Time Limit Exceeded (Infinite Loop?)" });
            }
            console.error(`Execution Error: ${stderr}`);
            return res.json({ output: stderr || error.message });
        }

        // Success! Send the output back to frontend
        console.log("Output:", stdout);
        res.json({ output: stdout });
    });
});

server.listen(3001, () => {
    console.log("SERVER RUNNING on http://localhost:3001");
});