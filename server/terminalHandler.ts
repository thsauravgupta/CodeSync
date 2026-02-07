// server/terminalHandler.ts
import { Socket } from "socket.io";
import * as pty from "node-pty";
import os from "os";

const shell = os.platform() === "win32" ? "powershell.exe" : "bash";

const terminals: { [key: string]: pty.IPty } = {};

export const setupTerminal = (socket: Socket) => {
    
    // Create a Terminal Session
    socket.on("terminal:write", (data: string) => {
        // If terminal doesn't exist for this socket, create one
        if (!terminals[socket.id]) {
            const ptyProcess = pty.spawn(shell, [], {
                name: "xterm-color",
                cols: 80,
                rows: 30,
                cwd: process.env.HOME, // Start in home directory
                env: process.env as any
            });

            terminals[socket.id] = ptyProcess;

            // Send terminal output to frontend
            ptyProcess.onData((data) => {
                socket.emit("terminal:data", data);
            });

            // Clean up on exit
            ptyProcess.onExit(() => {
                delete terminals[socket.id];
            });
        }

        // Write data (keystrokes) to the shell
        terminals[socket.id].write(data);
    });

    // Resize Terminal (Sync backend size with frontend window)
    socket.on("terminal:resize", ({ cols, rows }) => {
        if (terminals[socket.id]) {
            terminals[socket.id].resize(cols, rows);
        }
    });

    // Cleanup on Disconnect
    socket.on("disconnect", () => {
        if (terminals[socket.id]) {
            terminals[socket.id].kill();
            delete terminals[socket.id];
        }
    });
};