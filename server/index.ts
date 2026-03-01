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
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import helmet from "helmet"; // SECURITY: HTTP Header protection

// Custom Modules
import { setupTerminal } from "./terminalHandler"; 
import { codeQueue, queueEvents } from "./queue";
import { logger } from "./utils/logger";
import IORedis from "ioredis"; 
import { executeRateLimiter } from "./middleware/rateLimiter";
import { validate, schemas } from "./middleware/validate"; // SECURITY: Payload validation

dotenv.config();

const app = express();
const server = http.createServer(app);

// --- GLOBAL SECURITY MIDDLEWARE ---

// 1. Helmet: Hides Express headers, prevents XSS, adds strict security headers
app.use(helmet());

// 2. Strict CORS: Never use "*" in production.
const ALLOWED_ORIGINS = [
    "http://localhost:5173", // Local frontend
    process.env.FRONTEND_URL || "https://your-production-url.com" 
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like Postman during dev) OR strictly allowed origins
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Blocked by strict CORS policy'));
        }
    },
    credentials: true
}));

// 3. Payload Limit: Prevent memory exhaustion via massive JSON payloads
app.use(express.json({ limit: "100kb" })); 

// --- WEBSOCKET SETUP ---
const io = new Server(server, {
    cors: { 
        origin: ALLOWED_ORIGINS,
        credentials: true
    }
});

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";

const ysocketio = new YSocketIO(io, {});
ysocketio.initialize();

// --- 1. AUTHENTICATION API (Protected by Zod Validation) ---

app.post("/register", validate(schemas.authPayload), async (req, res) => {
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

app.post("/login", validate(schemas.authPayload), async (req, res) => {
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

// --- 3. CODE EXECUTION (QUEUE DISPATCHER) ---
// Protected by Rate Limiter (Redis) AND Payload Validation (Zod)
app.post("/execute", executeRateLimiter, validate(schemas.executePayload), async (req, res) => {
    const { code, language } = req.body;
    
    try {
        // Dispatch job to Redis queue (Handled by worker.ts)
        const job = await codeQueue.add("run-code", { code, language });

        // Wait for worker node to process job
        const result = await job.waitUntilFinished(queueEvents);

        res.json(result);
    } catch (err: any) {
        logger.error("Queue submission failed", { error: err.message });
        res.status(500).json({ output: "System Error: Job failed to execute" });
    }
});

// --- 4. SYSTEM HEALTH MONITORING ---

app.get("/health", async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        
        const redisClient = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: 1 });
        await redisClient.ping();
        redisClient.disconnect();

        res.status(200).json({ 
            status: "ok", 
            timestamp: new Date().toISOString(),
            database: "connected",
            redis: "connected"
        });
    } catch (error: any) {
        logger.error("Health Check Failed", { error: error.message, stack: error.stack });
        res.status(500).json({ status: "error", message: "System degraded" });
    }
});

// --- 5. WEBSOCKET CONTROLLER ---

io.on("connection", (socket) => {
    setupTerminal(socket);

    socket.on("join-dashboard", () => {
        socket.join("dashboard-room");
        socket.emit("system-stats", { 
            activeRooms: io.sockets.adapter.rooms.size, 
            activeUsers: io.engine.clientsCount 
        });
    });

    socket.on("join-room", async ({ roomId, username, userId, password }) => {
        socket.join(roomId);

        io.to("dashboard-room").emit("activity-log", {
            text: `${username} joined session ${roomId}`,
            time: new Date().toISOString()
        });
        
        io.to("dashboard-room").emit("system-stats", { 
            activeRooms: io.sockets.adapter.rooms.size, 
            activeUsers: io.engine.clientsCount 
        });

        try {
            let project = await prisma.project.findUnique({
                where: { roomId },
                include: { files: true } 
            });

            if (project && project.password && project.password !== password) {
                socket.emit("error", "Incorrect Password");
                return;
            }

            if (project) {
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
            logger.error("DB Error on Join", { error: err });
            socket.emit("error", "Failed to load project data.");
        }
    });

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
        } catch (e) { 
            logger.error("Message save failed", { error: e }); 
        }
    });

    socket.on("save-file", async ({ roomId, fileName, content }) => {
        try {
            const project = await prisma.project.findUnique({ where: { roomId } });
            if (!project) return;

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
        } catch (e) { 
            logger.error("Auto-save failed", { error: e }); 
        }
    });

    socket.on("join-audio", (roomId) => {
        socket.to(roomId).emit("user-joined-audio", socket.id);
    });
    
    socket.on("offer", (payload) => { io.to(payload.target).emit("offer", payload); });
    socket.on("answer", (payload) => { io.to(payload.target).emit("answer", payload); });
    socket.on("ice-candidate", (incoming) => { io.to(incoming.target).emit("ice-candidate", incoming.candidate); });

    socket.on("file-change", ({ roomId, fileName }) => {
        socket.to(roomId).emit("file-change", fileName);
    });
    
    socket.on("disconnect", () => {
         io.to("dashboard-room").emit("system-stats", { 
            activeRooms: io.sockets.adapter.rooms.size, 
            activeUsers: io.engine.clientsCount 
        });
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
   logger.info(`API Gateway listening`, { port: PORT });
});