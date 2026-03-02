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
import { v4 as uuidv4 } from 'uuid';

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
// --- GITHUB OAUTH INTEGRATION ---

// 1. Redirect user to GitHub's consent screen
app.get("/auth/github", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = "http://localhost:3001/auth/github/callback";
    // We request 'repo' scope to read and write to their repositories
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo`;
    
    res.redirect(githubAuthUrl);
});

// 2. GitHub redirects back here with a temporary 'code'
app.get("/auth/github/callback", async (req, res) => {
    const { code, state } = req.query; // state can be used to pass the userId securely

    if (!code) {
        return res.status(400).send("No code provided by GitHub");
    }

    try {
        // Exchange the code for an Access Token
        const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code: code
            })
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            throw new Error("Failed to retrieve access token");
        }

        // TODO: In Phase 2, we will link this token to the logged-in user in Postgres.
        // For now, we will redirect back to the frontend with the token so you can test it.
        res.redirect(`http://localhost:5173/dashboard?github_connected=true&token=${accessToken}`);

    } catch (error: any) {
        logger.error("GitHub OAuth Failed", { error: error.message });
        res.status(500).send("Authentication failed");
    }
}); 
// --- GITHUB OAUTH INTEGRATION ---

// 1. Redirect user to GitHub's consent screen (UPDATED)
app.get("/auth/github", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const redirectUri = "http://localhost:3001/auth/github/callback";
    
    // NEW: Grab the userId from the query string and encode it in the 'state' parameter
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).send("User ID is required");
    
    // Encode userId to base64 so it safely travels through GitHub's URL
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo&state=${state}`;
    
    res.redirect(githubAuthUrl);
});

// 2. GitHub redirects back here (UPDATED)
app.get("/auth/github/callback", async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state) return res.status(400).send("Invalid OAuth callback");

    try {
        // Decode the state to get our userId back
        const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
        const userId = decodedState.userId;

        // Exchange the code for an Access Token
        const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code: code
            })
        });

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) throw new Error("Failed to retrieve access token");

        // THE CRITICAL STEP: Save the token to the User in the Database
        await prisma.user.update({
            where: { id: userId },
            data: { gitHubToken: accessToken }
        });

        logger.info("GitHub successfully linked to user", { userId });

        // Redirect back to dashboard - no need to expose the token in the URL anymore!
        res.redirect(`http://localhost:5173/dashboard?github_connected=true`);

    } catch (error: any) {
        logger.error("GitHub OAuth Failed", { error: error.message });
        res.status(500).send("Authentication failed");
    }
});
// --- 2. PROJECT MANAGEMENT API ---
// --- IMPORT REPOSITORY FROM GITHUB ---


app.post("/projects/import-github", async (req, res) => {
    const { userId, repoUrl } = req.body; // repoUrl format: "owner/repo" e.g., "facebook/react"

    try {
        // 1. Get the user's secure token
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.gitHubToken) {
            return res.status(403).json({ error: "GitHub not connected" });
        }

        const githubToken = user.gitHubToken;
        const headers = {
            "Authorization": `Bearer ${githubToken}`,
            "Accept": "application/vnd.github.v3+json"
        };

        // 2. Fetch the default branch (usually main or master)
        const repoRes = await fetch(`https://api.github.com/repos/${repoUrl}`, { headers });
        if (!repoRes.ok) throw new Error("Repository not found or access denied");
        const repoData = await repoRes.json();
        const defaultBranch = repoData.default_branch;

        // 3. Fetch the ENTIRE file tree recursively in ONE API call
        const treeRes = await fetch(`https://api.github.com/repos/${repoUrl}/git/trees/${defaultBranch}?recursive=1`, { headers });
        const treeData = await treeRes.json();

        // 4. Create a new CodeSync Project
        const newRoomId = uuidv4().slice(0, 8).toUpperCase();
        const project = await prisma.project.create({
            data: {
                name: repoData.name,
                roomId: newRoomId,
                ownerId: userId,
            }
        });

        
        let filePromises = [];
        
        for (const item of treeData.tree) {
            // Skip massive folders like node_modules or .git
            if (item.path.includes("node_modules") || item.path.includes(".git")) continue;

            const isFolder = item.type === "tree";
            

            filePromises.push(
                prisma.file.create({
                    data: {
                        name: item.path, 
                        projectId: project.id,
                        content: isFolder ? "" : `// Imported from ${repoUrl}/${item.path}`,
                        language: "javascript" 
                    }
                })
            );
        }

        await Promise.all(filePromises);
        logger.info("GitHub Repository Imported", { repoUrl, projectId: project.id });

        res.json(project);

    } catch (error: any) {
        logger.error("Import Failed", { error: error.message });
        res.status(500).json({ error: "Failed to import repository" });
    }
});
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