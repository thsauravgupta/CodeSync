

import { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { SocketIOProvider } from 'y-socket.io';
import { MonacoBinding } from 'y-monaco';
import io, { Socket } from 'socket.io-client';
import Chat from './Chat';
import AudioRoom from './AudioRoom';
import Terminal from './Terminal';

interface CodeEditorProps {
  roomId: string;
  username: string;
  userId: string; // <--- NEW: Passed from App.tsx (Database ID)
  password?: string;
  onLeave: () => void;
}

const CodeEditor = ({ roomId, username, userId, password, onLeave }: CodeEditorProps) => {
  
  // State
  const [editorRef, setEditorRef] = useState<any>(null);
  const [files, setFiles] = useState<any>({}); 
  const [activeFile, setActiveFile] = useState("script.js");
  const [activeTab, setActiveTab] = useState<'files' | 'chat'>('files');
  const [output, setOutput] = useState(""); 
  const [isRunning, setIsRunning] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  // Refs for Yjs (Real-time Sync)
  const providerRef = useRef<SocketIOProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);

  // --- 1. SOCKET & DB CONNECTION ---
  useEffect(() => {
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    // Join with Custom User ID from Database
    if (userId) {
        newSocket.emit("join-room", { 
            roomId, 
            username, 
            userId: userId, // <--- Using the prop
            password 
        });
    }

    // Handlers
    newSocket.on("error", (msg) => {
        alert(msg);
        onLeave();
    });

    newSocket.on("load-project", ({ files: dbFiles, messages: dbMessages }) => {
        const newFilesState: any = {};
        if (dbFiles && dbFiles.length > 0) {
             dbFiles.forEach((f: any) => {
                newFilesState[f.name] = {
                    name: f.name,
                    language: f.language,
                    value: f.content
                };
            });
            setFiles(newFilesState);
            // Default to first file if active file is missing
            if (!newFilesState[activeFile]) {
                setActiveFile(dbFiles[0].name);
            }
        }
        
        if (dbMessages) setMessages(dbMessages);
    });

    newSocket.on("chat-message", (msg) => setMessages(prev => [...prev, msg]));
    newSocket.on("code-output", (out) => setOutput(out));
    newSocket.on("file-change", (fileName) => setActiveFile(fileName));

    return () => { newSocket.disconnect(); };
  }, [roomId, username, userId, password]);


  // --- 2. AUTO-SAVE LOGIC (Debounced) ---
  useEffect(() => {
    const timer = setTimeout(() => {
        if (socket && files[activeFile]) {
            socket.emit("save-file", {
                roomId,
                fileName: activeFile,
                content: files[activeFile].value
            });
        }
    }, 2000); 

    return () => clearTimeout(timer);
  }, [files, activeFile, socket, roomId]);


  // --- 3. YJS EDITOR BINDING (Real-time Sync) ---
  useEffect(() => {
    if (!editorRef || !socket || !files[activeFile]) return;

    // Cleanup old bindings
    if (providerRef.current) providerRef.current.destroy();
    if (docRef.current) docRef.current.destroy();
    if (bindingRef.current) bindingRef.current.destroy();

    const ydoc = new Y.Doc();
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
    
    // Unique Room per File
    const provider = new SocketIOProvider(SERVER_URL, `${roomId}-${activeFile}`, ydoc, { autoConnect: true });
    const yText = ydoc.getText('monaco');
    
    const binding = new MonacoBinding(
        yText, editorRef.getModel()!, new Set([editorRef]), provider.awareness
    );

    // Initialize content if empty (First load)
    if (yText.toString() === "") {
        yText.insert(0, files[activeFile].value);
    }

    provider.awareness.setLocalStateField('user', {
        name: username,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    });

    docRef.current = ydoc;
    providerRef.current = provider;
    bindingRef.current = binding;

    return () => {
      provider.destroy();
      ydoc.destroy();
      binding.destroy();
    };
  }, [editorRef, activeFile, roomId, username, socket]); 

  
  // --- HANDLERS ---
  const handleEditorChange = (value: string | undefined) => {
     if (value !== undefined) {
         setFiles((prev: any) => ({
             ...prev,
             [activeFile]: { ...prev[activeFile], value: value }
         }));
     }
  };

  const handleFileClick = (fileName: string) => {
    setActiveFile(fileName);
    socket?.emit("file-change", { roomId, fileName });
  };

  const runCode = async () => {
    setIsRunning(true);
    try {
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
        const response = await fetch(`${SERVER_URL}/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              code: files[activeFile].value, 
              language: files[activeFile].language 
            })
        });
        const data = await response.json();
        setOutput(data.output);
        socket?.emit("code-output", { roomId, output: data.output });
    } catch (error) {
        setOutput("Failed to run code");
    } finally {
        setIsRunning(false);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#000' }}>
       
       {/* 1. TOP HEADER (The HUD Bar) */}
       <header style={{ 
           height: '50px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', 
           justifyContent: 'space-between', padding: '0 20px', background: '#0a0a0a' 
       }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
             <h3 style={{ margin: 0, color: 'var(--neon-cyan)', letterSpacing: '2px' }}>CODESYNC_PROTOCOL</h3>
             <div style={{ fontSize: '12px', background: '#111', padding: '5px 10px', border: '1px solid #333', color: '#666' }}>
                ROOM: <span style={{ color: '#fff' }}>{roomId}</span>
             </div>
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={runCode} disabled={isRunning} className="btn-neon" style={{ padding: '5px 20px', width: 'auto' }}>
                {isRunning ? "COMPILING..." : "▶ RUN"}
            </button>
            <button onClick={onLeave} className="btn-danger" style={{ padding: '5px 20px', width: 'auto', background: 'transparent' }}>
                DISCONNECT
            </button>
          </div>
       </header>
      
      {/* 2. MAIN GRID (Sidebar | Editor+Terminal) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* SIDEBAR (Left) */}
        <aside style={{ 
            width: '260px', background: '#050505', borderRight: '1px solid #333', 
            display: 'flex', flexDirection: 'column' 
        }}>
           {socket && <AudioRoom socket={socket} roomId={roomId} />}
           
           <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
              <button onClick={() => setActiveTab('files')} style={{ flex: 1, padding: '10px', background: activeTab === 'files' ? '#111' : 'transparent', color: activeTab === 'files' ? 'var(--neon-cyan)' : '#666', border: 'none', cursor: 'pointer' }}>FILES</button>
              <button onClick={() => setActiveTab('chat')} style={{ flex: 1, padding: '10px', background: activeTab === 'chat' ? '#111' : 'transparent', color: activeTab === 'chat' ? 'var(--neon-cyan)' : '#666', border: 'none', cursor: 'pointer' }}>COMMS</button>
           </div>

           <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
             {activeTab === 'files' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                   {Object.keys(files).map((fileName) => (
                     <div 
                       key={fileName}
                       onClick={() => handleFileClick(fileName)}
                       style={{ 
                         padding: '10px', cursor: 'pointer', borderRadius: '4px',
                         background: activeFile === fileName ? 'rgba(0, 243, 255, 0.1)' : 'transparent',
                         color: activeFile === fileName ? 'var(--neon-cyan)' : '#888',
                         border: activeFile === fileName ? '1px solid var(--neon-cyan)' : '1px solid transparent',
                         display: 'flex', alignItems: 'center', gap: '10px'
                       }}
                     >
                       <span>{fileName.endsWith('js') ? '{}' : '#'}</span>
                       {fileName}
                     </div>
                   ))}
                </div>
             ) : (
                <Chat 
                  socket={socket} roomId={roomId} username={username} 
                  messages={messages} setMessages={setMessages}
                />
             )}
           </div>
        </aside>

        {/* WORKSPACE (Right) */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Editor (Top 70%) */}
            <div style={{ flex: 0.7, position: 'relative', borderBottom: '1px solid #333' }}>
              {files[activeFile] && (
                  <Editor
                      height="100%"
                      language={files[activeFile].language}
                      theme="vs-dark"
                      value={files[activeFile].value}
                      onChange={handleEditorChange}
                      onMount={(editor) => setEditorRef(editor)}
                      options={{ 
                          minimap: { enabled: false }, 
                          fontSize: 14, 
                          fontFamily: 'JetBrains Mono',
                          padding: { top: 20 },
                          scrollBeyondLastLine: false
                      }}
                  />
              )}
            </div>

            {/* Terminal (Bottom 30%) */}
                    <div style={{ flex: 0.3, background: '#0a0a0a', borderTop: '1px solid #333', overflow: 'hidden' }}>
            <div style={{ padding: '5px 15px', background: '#111', fontSize: '11px', color: '#666' }}>
                TERMINAL (POWERSHELL/BASH)
            </div>
            <div style={{ height: 'calc(100% - 25px)' }}> {/* Subtract header height */}
                {socket && <Terminal socket={socket} />}
            </div>
        </div>
        </main>
      </div>
    </div>
  );
};

export default CodeEditor;