import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
// @ts-ignore
import { YSocketIO } from "y-socket.io/dist/server";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { setupTerminal } from "./terminalHandler"; // Import the terminal logic

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";

// Initialize Yjs (Real-time Text Sync)
const ysocketio = new YSocketIO(io, {});
ysocketio.initialize();

// --- 1. AUTHENTICATION API ---

app.post("/register", async (req, res) => {
    const { email, password, name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, password: hashedPassword, name }
        });
        const token = jwt.sign({ userId: user.id, name: user.name }, JWT_SECRET);
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (e) {
        res.status(400).json({ error: "Email already exists" });
    }
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const token = jwt.sign({ userId: user.id, name: user.name }, JWT_SECRET);
        res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    } catch (e) {
        res.status(500).json({ error: "Login failed" });
    }
});

// --- 2. PROJECT MANAGEMENT API ---

app.get("/projects/:userId", async (req, res) => {
    try {
        const projects = await prisma.project.findMany({
            where: { ownerId: req.params.userId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(projects);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch projects" });
    }
});

app.post("/projects", async (req, res) => {
    const { userId, name, roomId, password } = req.body;
    try {
        const project = await prisma.project.create({
            data: {
                name,
                roomId,
                password: password || null,
                ownerId: userId,
                files: {
                    create: [
                        { name: "script.js", language: "javascript", content: "// " + name },
                        { name: "style.css", language: "css", content: "body { background: #000; }" }
                    ]
                }
            }
        });
        res.json(project);
    } catch (e) {
        res.status(500).json({ error: "Failed to create project" });
    }
});

app.delete("/projects/:projectId", async (req, res) => {
    try {
        await prisma.file.deleteMany({ where: { projectId: req.params.projectId } });
        await prisma.message.deleteMany({ where: { projectId: req.params.projectId } });
        await prisma.project.delete({ where: { id: req.params.projectId } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to delete project" });
    }
});

// --- 3. CODE EXECUTION ENGINE (Docker) ---

const LANGUAGE_CONFIG: any = {
    javascript: { image: "node:18-alpine", cmd: "node", ext: "js" },
    python: { image: "python:3.9-alpine", cmd: "python", ext: "py" },
    cpp: { image: "gcc:latest", cmd: "g++ -o /app/out /app/code.cpp && /app/out", ext: "cpp" }
};

// server/index.ts (Update the execute route)

app.post("/execute", async (req, res) => {
    const { code, language } = req.body;
    const config = LANGUAGE_CONFIG[language];
    if (!config) return res.status(400).json({ output: "Language not supported" });

    const filename = `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${config.ext}`;
    const hostTempDir = path.join(__dirname, "temp");
    const hostFilePath = path.join(hostTempDir, filename);
    
    // Ensure temp dir exists
    if (!fs.existsSync(hostTempDir)) fs.mkdirSync(hostTempDir);
    fs.writeFileSync(hostFilePath, code);

    // SECURITY: Limit Memory, CPU, Network, and explicitly name container for cleanup
    const containerName = `box_${Date.now()}`;
    const dockerCmd = `docker run --name ${containerName} --rm -v "${hostTempDir}:/app" -w /app --network none --memory="100m" --cpus="0.5" ${config.image} sh -c "${config.cmd.replace('code.cpp', filename).replace(filename, filename)}"`;

    // EXECUTION with Safety Timeout
    exec(dockerCmd, { timeout: 4000 }, (error, stdout, stderr) => {
        // Cleanup File
        fs.unlink(hostFilePath, () => {});

        if (error) {
            // FORCE KILL if timeout happened (Zombie prevention)
            exec(`docker kill ${containerName}`, () => {}); 
            
            // Check if it was a timeout
            if (error.killed) return res.json({ output: "Error: Execution Timed Out (Infinite Loop?)" });
            return res.json({ output: stderr || error.message });
        }
        res.json({ output: stdout });
    });
});

// SOCKET.IO (Real-time Logic)

io.on("connection", (socket) => {
    // A. INTERACTIVE TERMINAL (node-pty)
    setupTerminal(socket);

    // B. DASHBOARD REAL-TIME STATS
    socket.on("join-dashboard", () => {
        socket.join("dashboard-room");
        // Broadcast Stats immediately
        socket.emit("system-stats", { 
            activeRooms: io.sockets.adapter.rooms.size, 
            activeUsers: io.engine.clientsCount 
        });
    });

    // C. JOIN ROOM & LOAD DATA
    socket.on("join-room", async ({ roomId, username, userId, password }) => {
        socket.join(roomId);

        // Notify Dashboard (S-Tier Feature)
        io.to("dashboard-room").emit("activity-log", {
            text: `${username} joined session ${roomId}`,
            time: new Date().toISOString()
        });
        io.to("dashboard-room").emit("system-stats", { 
            activeRooms: io.sockets.adapter.rooms.size, 
            activeUsers: io.engine.clientsCount 
        });

        try {
            // Find Project
            let project = await prisma.project.findUnique({
                where: { roomId },
                include: { files: true } 
            });

            // Security Check
            if (project && project.password && project.password !== password) {
                socket.emit("error", "Incorrect Password");
                return;
            }

            // Create if guest/new (Optional fallback)
            if (!project && userId) {
                 // In a real app, you might block this, but for now we allow dynamic room creation
                 // Use a default/guest user if needed, or error out.
                 // Ideally projects are created via API now, so this handles "Load"
            }

            if (project) {
                 // Fetch Chat History
                const messages = await prisma.message.findMany({
                    where: { projectId: project.id },
                    orderBy: { createdAt: 'asc' },
                    take: 50,
                    include: { user: true }
                });

                const formattedMessages = messages.map(m => ({
                    username: m.user.name,
                    text: m.text,
                    time: m.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }));

                socket.emit("load-project", {
                    files: project.files,
                    messages: formattedMessages
                });
            }

            socket.to(roomId).emit("notification", `${username} joined the room`);

        } catch (err) {
            console.error("DB Error on Join:", err);
            socket.emit("error", "Failed to load project data.");
        }
    });

    // D. CHAT & SAVING
    socket.on("chat-message", async (data) => {
        const { roomId, username, text, userId } = data;
        socket.to(roomId).emit("chat-message", data);

        try {
            const project = await prisma.project.findUnique({ where: { roomId } });
            if (project && userId) {
                await prisma.message.create({
                    data: { text, projectId: project.id, userId: userId }
                });
            }
        } catch (e) { console.error(e); }
    });

    socket.on("save-file", async ({ roomId, fileName, content }) => {
        try {
            const project = await prisma.project.findUnique({ where: { roomId } });
            if (!project) return;

            // Upsert (Update if exists, Create if not - handles "Import Folder")
            const file = await prisma.file.findFirst({
                where: { projectId: project.id, name: fileName }
            });

            if (file) {
                await prisma.file.update({ where: { id: file.id }, data: { content } });
            } else {
                await prisma.file.create({
                    data: { name: fileName, content, language: "javascript", projectId: project.id }
                });
            }
        } catch (e) { console.error("Auto-save failed:", e); }
    });

    // E. WEBRTC AUDIO
    socket.on("join-audio", (roomId) => {
        socket.to(roomId).emit("user-joined-audio", socket.id);
    });
    socket.on("offer", (payload) => { io.to(payload.target).emit("offer", payload); });
    socket.on("answer", (payload) => { io.to(payload.target).emit("answer", payload); });
    socket.on("ice-candidate", (incoming) => { io.to(incoming.target).emit("ice-candidate", incoming.candidate); });

    // F. STANDARD EVENTS
    socket.on("file-change", ({ roomId, fileName }) => {
        socket.to(roomId).emit("file-change", fileName);
    });
    
    // Cleanup Stats
    socket.on("disconnect", () => {
         io.to("dashboard-room").emit("system-stats", { 
            activeRooms: io.sockets.adapter.rooms.size, 
            activeUsers: io.engine.clientsCount 
        });
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`SERVER RUNNING on Port ${PORT}`);
});