import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { YSocketIO } from "y-socket.io/dist/server";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" } 
});

const ysocketio = new YSocketIO(io, {});
ysocketio.initialize();

// --- IN-MEMORY STORAGE ---
// In a real production app (Month 4), you would use Redis/Database for this.
const roomPasswords: { [key: string]: string } = {};
const roomMessages: { [key: string]: any[] } = {};

io.on("connection", (socket) => {
    
    // 1. JOIN ROOM (With Password Check)
    socket.on("join-room", ({ roomId, password, username }) => {
        
        // Check if room has a password
        if (roomPasswords[roomId]) {
            if (roomPasswords[roomId] !== password) {
                socket.emit("error", "Incorrect Password");
                return;
            }
        } else {
            // If room is new and user sent a password, set it
            if (password) {
                roomPasswords[roomId] = password;
            }
        }

        socket.join(roomId);
        console.log(`User ${username} joined ${roomId}`);

        // Send Chat History to the NEW user only
        if (roomMessages[roomId]) {
            socket.emit("chat-history", roomMessages[roomId]);
        }

        // Notify others
        socket.to(roomId).emit("notification", `${username} joined the room`);
    });

    // 2. CHAT MESSAGES (With History)
    socket.on("chat-message", (data) => {
        const { roomId } = data;
        
        // Save to memory
        if (!roomMessages[roomId]) roomMessages[roomId] = [];
        roomMessages[roomId].push(data);

        // Limit history to last 50 messages to save RAM
        if (roomMessages[roomId].length > 50) roomMessages[roomId].shift();

        // Broadcast
        socket.to(roomId).emit("chat-message", data);
    });

    // ... (Keep Language/Code Sync events same as before) ...
    socket.on("language-change", ({ roomId, language }) => {
        socket.to(roomId).emit("language-change", language);
    });

    socket.on("code-output", ({ roomId, output }) => {
        socket.to(roomId).emit("code-output", output);
    });
});

// ... (Keep Docker/Piston Execution Logic same as before) ...

server.listen(process.env.PORT || 3001, () => {
    console.log(`SERVER RUNNING on Port ${process.env.PORT || 3001}`);
});