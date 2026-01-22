import { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { SocketIOProvider } from 'y-socket.io';
import { MonacoBinding } from 'y-monaco';
import io, { Socket } from 'socket.io-client';
import Chat from './Chat'; // Importing the new Chat component

interface CodeEditorProps {
  roomId: string;
  username: string;
  avatar?: string;
  password?: string;
  onLeave: () => void;
}

// Default Files
const INITIAL_FILES = {
  "script.js": { name: "script.js", language: "javascript", value: "// Start coding..." },
  "style.css": { name: "style.css", language: "css", value: "/* Add styles here */" },
  "index.html": { name: "index.html", language: "html", value: "" }
};

const CodeEditor = ({ roomId, username, password, onLeave }: CodeEditorProps) => {
  const [editorRef, setEditorRef] = useState<any>(null);
  const [files, setFiles] = useState<any>(INITIAL_FILES);
  const [activeFile, setActiveFile] = useState("script.js");
  const [activeTab, setActiveTab] = useState<'files' | 'chat'>('files');
  
  // Terminal / Runner State
  const [output, setOutput] = useState(""); 
  const [isRunning, setIsRunning] = useState(false);
  
  // Socket & Chat State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<any[]>([]); // Lifted State for Chat

  // Refs for Yjs cleanup
  const providerRef = useRef<SocketIOProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);

  // --- 1. GLOBAL SOCKET SETUP (Chat, Events, Runner) ---
  useEffect(() => {
    // Connect to Backend
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    // Join Room with Password
    newSocket.emit("join-room", { roomId, username, password });

    // Listeners
    newSocket.on("error", (msg) => {
        alert(msg);
        onLeave();
    });

    newSocket.on("notification", (msg) => {
        // Optional: Add a system message to chat
        setMessages(prev => [...prev, { username: "System", text: msg, time: "Now" }]);
    });

    // Chat Logic
    newSocket.on("chat-history", (history: any[]) => {
        setMessages(history);
    });

    newSocket.on("chat-message", (msg) => {
        setMessages(prev => [...prev, msg]);
    });

    // File Switching Logic
    newSocket.on("file-change", (fileName: string) => {
       setActiveFile(fileName);
    });

    // Code Runner Logic
    newSocket.on("code-output", (out: string) => setOutput(out));

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, username, password, onLeave]);

  // --- 2. YJS EDITOR BINDING (Syncs Code) ---
  useEffect(() => {
    if (!editorRef || !socket) return;

    // Cleanup old bindings
    if (providerRef.current) providerRef.current.destroy();
    if (docRef.current) docRef.current.destroy();
    if (bindingRef.current) bindingRef.current.destroy();

    // Init Yjs
    const ydoc = new Y.Doc();
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
    
    // Create Provider (Unique room per file)
    const provider = new SocketIOProvider(
      SERVER_URL, 
      `${roomId}-${activeFile}`, 
      ydoc, 
      { autoConnect: true }
    );
    
    const yText = ydoc.getText('monaco');
    
    // Bind to Monaco
    const binding = new MonacoBinding(
        yText, 
        editorRef.getModel()!, 
        new Set([editorRef]), 
        provider.awareness
    );

    // Set Cursor Awareness
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
  const handleFileClick = (fileName: string) => {
    setActiveFile(fileName);
    socket?.emit("file-change", { roomId, fileName });
  };

  const runCode = async () => {
    setIsRunning(true);
    const currentCode = editorRef.getValue(); 
    try {
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
        const response = await fetch(`${SERVER_URL}/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              code: currentCode, 
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
    <div className="App">
       {/* Toolbar */}
       <div className="toolbar">
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
             <h3 style={{ margin: 0, color: '#61dafb' }}>CodeSync</h3>
             <div style={{ fontSize: '12px', background: '#333', padding: '4px 8px', borderRadius: '4px', color: '#aaa', display: 'flex', gap: '10px' }}>
                <span>Room: {roomId}</span>
                {password && <span>🔒 Private</span>}
             </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={runCode} disabled={isRunning} className="btn btn-primary">
                {isRunning ? "Running..." : "Run ▶"}
            </button>
            <button onClick={onLeave} className="btn btn-danger">Leave</button>
          </div>
      </div>
      
      {/* Main Workspace (Full Screen) */}
      <div className="workspace">
        
        {/* Sidebar */}
        <div className="sidebar">
           {/* Sidebar Tabs */}
           <div className="sidebar-header">
              <button 
                onClick={() => setActiveTab('files')}
                className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
              >
                Files
              </button>
              <button 
                onClick={() => setActiveTab('chat')}
                className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
              >
                Chat
              </button>
           </div>

           {/* Sidebar Content */}
           <div style={{ flex: 1, overflowY: 'auto' }}>
             {activeTab === 'files' ? (
                <div>
                  <div style={{ padding: '15px', fontWeight: '600', fontSize: '0.8rem', color: '#666', letterSpacing: '1px' }}>EXPLORER</div>
                   {Object.keys(files).map((fileName) => (
                     <div 
                       key={fileName}
                       onClick={() => handleFileClick(fileName)}
                       style={{ 
                         padding: '10px 15px', 
                         cursor: 'pointer', 
                         background: activeFile === fileName ? '#2a2d2e' : 'transparent',
                         color: activeFile === fileName ? '#fff' : '#888',
                         display: 'flex', alignItems: 'center', gap: '10px',
                         fontSize: '14px'
                       }}
                     >
                       <span>{fileName.endsWith('js') ? '📄' : fileName.endsWith('css') ? '🎨' : '📝'}</span>
                       {fileName}
                     </div>
                   ))}
                </div>
             ) : (
                <Chat 
                  socket={socket} 
                  roomId={roomId} 
                  username={username} 
                  messages={messages} 
                  setMessages={setMessages}
                />
             )}
           </div>
        </div>

        {/* Editor & Terminal Column */}
        <div className="editor-container">
             {/* Active File Header */}
             <div style={{ background: '#1e1e1e', padding: '10px 20px', fontSize: '13px', color: '#ccc', borderBottom: '1px solid #333' }}>
                {activeFile} <span style={{opacity: 0.5, marginLeft: '10px', fontSize: '11px'}}>(Live)</span>
             </div>
            
            {/* Monaco Editor */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Editor
                  height="100%"
                  language={files[activeFile].language}
                  theme="vs-dark"
                  onMount={(editor) => setEditorRef(editor)}
                  options={{ 
                    minimap: { enabled: false }, 
                    fontSize: 15, 
                    padding: { top: 20 },
                    scrollBeyondLastLine: false,
                    automaticLayout: true 
                  }}
              />
            </div>

            {/* Terminal Panel */}
            <div className="terminal-panel">
                <div style={{ padding: '8px 15px', background: '#222', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '12px', color: '#aaa', display: 'flex', justifyContent: 'space-between' }}>
                  <span>TERMINAL OUTPUT</span>
                  <button onClick={() => setOutput("")} style={{background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:'11px'}}>Clear</button>
                </div>
                <pre style={{ flex: 1, padding: '15px', color: '#00ff00', fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowY: 'auto', margin: 0, fontSize: '13px' }}>
                    {output || "> Ready to compile..."}
                </pre>
            </div>
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;