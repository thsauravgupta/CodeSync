import { Socket } from "socket.io";
import * as pty from "node-pty";
import os from "os";


const shell = os.platform() === "win32" ? "powershell.exe" : "bash";


const terminals: { [key: string]: pty.IPty } = {};

export const setupTerminal = (socket: Socket) => {

    socket.on("terminal:write", (data: string) => {

        if (!terminals[socket.id]) {

            const ptyProcess = pty.spawn(shell, [], {
                name: "xterm-color",
                cols: 80,
                rows: 30,
                cwd: process.env.HOME, 
                env: process.env as any
            });

            terminals[socket.id] = ptyProcess;

            // Pipe terminal output (stdout) back to the frontend
            ptyProcess.onData((data) => {
                socket.emit("terminal:data", data);
            });

            // Cleanup if the shell exits internally (e.g., user types "exit")
            ptyProcess.onExit(({ exitCode, signal }) => {
                // delete terminals[socket.id]; // Optional: Keep strict lifecycle managed by socket
                socket.emit("terminal:data", `\r\n[Process terminated with exit code: ${exitCode}]`);
            });
        }

        // Write user input to the shell process
        terminals[socket.id].write(data);
    });

    //  Handle Resize Events (Sync frontend window size with backend)
    socket.on("terminal:resize", ({ cols, rows }) => {
        if (terminals[socket.id]) {
            try {
                terminals[socket.id].resize(cols, rows);
            } catch (err) {
                console.error("Terminal resize failed:", err);
            }
        }
    });

    // Cleanup on Disconnect (Prevent Zombie Processes)
    socket.on("disconnect", () => {
        if (terminals[socket.id]) {
            console.log(`Killing terminal for socket ${socket.id}`);
            terminals[socket.id].kill(); // Force kill the process
            delete terminals[socket.id]; // Remove from memory map
        }
    });
};