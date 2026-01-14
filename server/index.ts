import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { YSocketIO } from "y-socket.io/dist/server"; // Import the Y-Socket.IO logic

const app = express();
app.use(cors());

const server = http.createServer(app);

// Standard Socket.io setup
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Initialize Y-Socket.IO
const ysocketio = new YSocketIO(io, {
  // Optional: Store data in JSON files so you don't lose code on restart
  // gc: true,
});

ysocketio.initialize();

// Standard logging
io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // Note: Y-Socket.IO handles the syncing logic automatically!
  // You don't need manual .on("code-change") listeners anymore.

  socket.on("disconnect", () => {
    console.log("User Disconnected", socket.id);
  });
});

server.listen(3001, () => {
  console.log("SERVER RUNNING on http://localhost:3001");
});