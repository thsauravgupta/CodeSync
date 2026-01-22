import { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { SocketIOProvider } from 'y-socket.io';
import { MonacoBinding } from 'y-monaco';
import io, { Socket } from 'socket.io-client';
import Chat from './Chat';

interface CodeEditorProps {
  roomId: string;
  username: string;
  onLeave: () => void;
}

// Default initial files
const INITIAL_FILES = {
  "script.js": { name: "script.js", language: "javascript", value: "// Start coding..." },
  "style.css": { name: "style.css", language: "css", value: "/* Add styles here */" },
  "README.md": { name: "README.md", language: "markdown", value: "# Project Title" }
};

const CodeEditor = ({ roomId, username, onLeave }: CodeEditorProps) => {
  const [editorRef, setEditorRef] = useState<any>(null);
  const [files, setFiles] = useState<any>(INITIAL_FILES);
  const [activeFile, setActiveFile] = useState("script.js");
  const [output, setOutput] = useState(""); 
  const [isRunning, setIsRunning] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'chat'>('files');

  // We need refs to clean up Yjs bindings properly when switching files
  const providerRef = useRef<SocketIOProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);

  useEffect(() => {
    // 1. Basic Socket Setup (Run once)
    const newSocket = io("http://localhost:3001");
    setSocket(newSocket);
    newSocket.emit("join-room", roomId);

    newSocket.on("code-output", (out: string) => setOutput(out));
    
    // Listen for file switching from other users
    newSocket.on("file-change", (fileName: string) => {
       setActiveFile(fileName);
    });

    return () => { newSocket.disconnect(); };
  }, [roomId]);


  // 2. Yjs Binding Logic (Runs every time activeFile or Editor changes)
  useEffect(() => {
    if (!editorRef) return;

    // Cleanup old binding before creating a new one
    if (providerRef.current) providerRef.current.destroy();
    if (docRef.current) docRef.current.destroy();
    if (bindingRef.current) bindingRef.current.destroy();

    // Create new Yjs Doc for this specific file
    // Note: We use a unique room name per file
    const ydoc = new Y.Doc();
    const provider = new SocketIOProvider(
      "http://localhost:3001", 
      `${roomId}-${activeFile}`, // <--- Unique room for each file
      ydoc, 
      { autoConnect: true }
    );
    
    const yText = ydoc.getText('monaco');
    
    const binding = new MonacoBinding(
        yText, 
        editorRef.getModel()!, 
        new Set([editorRef]), 
        provider.awareness
    );

    // Set user awareness
    provider.awareness.setLocalStateField('user', {
        name: username,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    });

    docRef.current = ydoc;
    providerRef.current = provider;
    bindingRef.current = binding;

    return () => {
      // Cleanup happens on next run or unmount
      provider.destroy();
      ydoc.destroy();
      binding.destroy();
    };
  }, [editorRef, activeFile, roomId, username]);

  const handleFileClick = (fileName: string) => {
    setActiveFile(fileName);
    // Tell everyone else to switch too
    socket?.emit("file-change", { roomId, fileName });
  };

  const runCode = async () => {
    setIsRunning(true);
    // We only run the active file's content
    // Note: In a real IDE, you'd save current content to 'files' state first
    const currentCode = editorRef.getValue(); 
    
    try {
        const response = await fetch("http://localhost:3001/execute", {
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
    <div className="App" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d', color: '#fff' }}>
       {/* Toolbar ... */}
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* SIDEBAR */}
        <div style={{ width: '250px', background: '#111', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
           
           {/* Sidebar Tabs */}
           <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
              <button 
                onClick={() => setActiveTab('files')}
                style={{ flex: 1, padding: '10px', background: activeTab === 'files' ? '#1e1e1e' : 'transparent', color: activeTab === 'files' ? '#fff' : '#888', border: 'none', cursor: 'pointer' }}
              >
                Files
              </button>
              <button 
                onClick={() => setActiveTab('chat')}
                style={{ flex: 1, padding: '10px', background: activeTab === 'chat' ? '#1e1e1e' : 'transparent', color: activeTab === 'chat' ? '#fff' : '#888', border: 'none', cursor: 'pointer' }}
              >
                Chat
              </button>
           </div>

           {/* Sidebar Content */}
           <div style={{ flex: 1, overflowY: 'auto' }}>
             {activeTab === 'files' ? (
                // EXISTING FILE EXPLORER CODE
                <div>
                  <div style={{ padding: '10px', fontWeight: 'bold', fontSize: '0.8em', color: '#888' }}>EXPLORER</div>
                   {Object.keys(files).map((fileName) => (
                     <div 
                       key={fileName}
                       onClick={() => handleFileClick(fileName)}
                       style={{ /* ... existing styles ... */ }}
                     >
                       <span style={{ fontSize: '12px' }}>{fileName.endsWith('js') ? '📄' : '📝'}</span>
                       {fileName}
                     </div>
                   ))}
                </div>
             ) : (
                // NEW CHAT COMPONENT
                <Chat socket={socket} roomId={roomId} username={username} />
             )}
           </div>
        </div>

        {/* Editor Area */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
             {/* File Tab Header */}
             <div style={{ background: '#1e1e1e', padding: '5px 20px', fontSize: '0.8em', color: '#aaa', borderBottom: '1px solid #333' }}>
                {activeFile}
             </div>
            <Editor
                height="100%"
                language={files[activeFile].language} // Dynamic Language
                theme="vs-dark"
                onMount={(editor) => setEditorRef(editor)}
                options={{ minimap: { enabled: false }, fontSize: 16, padding: { top: 20 } }}
            />
        </div>

        {/* Terminal */}
        <div style={{ flex: 1, background: '#111', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #333' }}>
            <div style={{ padding: '10px', background: '#222', borderBottom: '1px solid #333', fontWeight: 'bold' }}>Output</div>
            <pre style={{ padding: '15px', color: '#0f0', fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowY: 'auto' }}>
                {output || "Waiting for output..."}
            </pre>
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;