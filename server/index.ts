import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { YSocketIO } from "y-socket.io/dist/server";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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

const ysocketio = new YSocketIO(io, {});
ysocketio.initialize();

// AUTHENTICATION API 

// Register Endpoint
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

// CODE EXECUTION ENGIN
const LANGUAGE_CONFIG: any = {
    javascript: { image: "node:18-alpine", cmd: "node", ext: "js" },
    python: { image: "python:3.9-alpine", cmd: "python", ext: "py" },
    cpp: { image: "gcc:latest", cmd: "g++ -o /app/out /app/code.cpp && /app/out", ext: "cpp" }
};

app.post("/execute", (req, res) => {
    const { code, language } = req.body;
    const config = LANGUAGE_CONFIG[language];

    if (!config) return res.status(400).json({ output: "Language not supported" });

    const filename = `code_${Date.now()}.${config.ext}`;
    const hostTempDir = path.join(__dirname, "temp");
    const hostFilePath = path.join(hostTempDir, filename);

    if (!fs.existsSync(hostTempDir)) fs.mkdirSync(hostTempDir);
    fs.writeFileSync(hostFilePath, code);


    const dockerCmd = `docker run --rm -v "${hostTempDir}:/app" -w /app --network none ${config.image} sh -c "${config.cmd.replace('code.cpp', filename).replace(filename, filename)}"`;

    exec(dockerCmd, { timeout: 5000 }, (error, stdout, stderr) => {
        fs.unlink(hostFilePath, () => {}); // Cleanup
        if (error) {
            return res.json({ output: stderr || error.message });
        }
        res.json({ output: stdout });
    });
});

//SOCKET IO LOGIC 
io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // A. JOIN ROOM & LOAD DATA
    socket.on("join-room", async ({ roomId, username, userId, password }) => {
        socket.join(roomId);

        try {
            // Find or Create Project (Room)
            let project = await prisma.project.findUnique({
                where: { roomId },
                include: { files: true } 
            });

            if (!project) {
                // If User ID is missing (guest), we use a placeholder for the owner
                // In production, you might enforce login for creating rooms
                const ownerId = userId || (await prisma.user.findFirst())?.id; 

                if (!ownerId) {
                     socket.emit("error", "System Error: No users exist to own this project.");
                     return;
                }

                project = await prisma.project.create({
                    data: {
                        roomId,
                        name: `Project ${roomId}`,
                        password: password || null, 
                        ownerId: ownerId,
                        files: {
                            create: [
                                { name: "script.js", language: "javascript", content: "// Start coding..." },
                                { name: "style.css", language: "css", content: "/* Styles */" },
                            ]
                        }
                    },
                    include: { files: true }
                });
            } else {
                if (project.password && project.password !== password) {
                    socket.emit("error", "Incorrect Password");
                    return;
                }
            }

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

            // Send Data to Client
            socket.emit("load-project", {
                files: project.files,
                messages: formattedMessages
            });

            socket.to(roomId).emit("notification", `${username} joined the room`);

        } catch (err) {
            console.error("DB Error on Join:", err);
            socket.emit("error", "Failed to load project data.");
        }
    });

    // CHAT MESSAGES
    socket.on("chat-message", async (data) => {
        const { roomId, username, text, userId } = data;
        socket.to(roomId).emit("chat-message", data); // Broadcast

        try {
            const project = await prisma.project.findUnique({ where: { roomId } });
            // Only save if we have a valid userId
            if (project && userId) {
                await prisma.message.create({
                    data: {
                        text,
                        projectId: project.id,
                        userId: userId
                    }
                });
            }
        } catch (e) {
            console.error("Failed to save message:", e);
        }
    });

    // AUTO-SAVE FILES
    socket.on("save-file", async ({ roomId, fileName, content }) => {
        try {
            const project = await prisma.project.findUnique({ where: { roomId } });
            if (!project) return;

            const file = await prisma.file.findFirst({
                where: { projectId: project.id, name: fileName }
            });

            if (file) {
                await prisma.file.update({
                    where: { id: file.id },
                    data: { content }
                });
                console.log(`Auto-saved ${fileName}`);
            }
        } catch (e) {
            console.error("Auto-save failed:", e);
        }
    });

    // AUDIO ROOM (WebRTC Signaling)
    socket.on("join-audio", (roomId) => {
        socket.to(roomId).emit("user-joined-audio", socket.id);
    });

    socket.on("offer", (payload) => {
        io.to(payload.target).emit("offer", payload);
    });

    socket.on("answer", (payload) => {
        io.to(payload.target).emit("answer", payload);
    });

    socket.on("ice-candidate", (incoming) => {
        io.to(incoming.target).emit("ice-candidate", incoming.candidate);
    });

    // STANDARD EVENTS
    socket.on("language-change", ({ roomId, language }) => {
        socket.to(roomId).emit("language-change", language);
    });
    
    socket.on("code-output", ({ roomId, output }) => {
        socket.to(roomId).emit("code-output", output);
    });

    socket.on("file-change", ({ roomId, fileName }) => {
        socket.to(roomId).emit("file-change", fileName);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`SERVER RUNNING on Port ${PORT}`);
});