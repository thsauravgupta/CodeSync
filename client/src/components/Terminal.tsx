import { useEffect, useRef } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css'; 

interface TerminalProps {
    socket: any;
}

const Terminal = ({ socket }: TerminalProps) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerminal | null>(null);

    useEffect(() => {
        if (!terminalRef.current || !socket) return;

        // Initialize xterm
        const term = new XTerminal({
            cursorBlink: true,
            theme: {
                background: '#0a0a0a',
                foreground: '#00ff41', // Matrix Green text
                cursor: '#00f3ff',     // Cyan cursor
                selectionBackground: 'rgba(0, 243, 255, 0.3)',
            },
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 14,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;

        // 2. Write to Backend on Type
        term.onData((data) => {
            socket.emit("terminal:write", data);
        });

        // 3. Listen for Backend Output
        socket.on("terminal:data", (data: string) => {
            term.write(data);
        });

        // Handle Resize
        const handleResize = () => {
             fitAddon.fit();
             if(xtermRef.current) {
                socket.emit("terminal:resize", { 
                    cols: xtermRef.current.cols, 
                    rows: xtermRef.current.rows 
                });
             }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            term.dispose();
            socket.off("terminal:data");
            window.removeEventListener('resize', handleResize);
        };
    }, [socket]);

    return (
        <div 
            ref={terminalRef} 
            style={{ 
                width: '100%', 
                height: '100%', 
                background: '#0a0a0a',
                padding: '5px' 
            }} 
        />
    );
};

export default Terminal;