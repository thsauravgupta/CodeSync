import { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { SocketIOProvider } from 'y-socket.io';
import { MonacoBinding } from 'y-monaco';
import io, { Socket } from 'socket.io-client';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Components
import Chat from './Chat';
import AudioRoom from './AudioRoom';
import Terminal from './Terminal'; // The interactive terminal we built

interface CodeEditorProps {
  roomId: string;
  username: string;
  userId: string; 
  password?: string;
  onLeave: () => void;
}

const CodeEditor = ({ roomId, username, userId, password, onLeave }: CodeEditorProps) => {
  
  // State
  const [editorRef, setEditorRef] = useState<any>(null);
  const [files, setFiles] = useState<any>({}); 
  const [activeFile, setActiveFile] = useState("script.js");
  const [activeTab, setActiveTab] = useState<'files' | 'chat'>('files');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  // Refs for Yjs 
  const providerRef = useRef<SocketIOProvider | null>(null);
  const docRef = useRef<Y.Doc | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);

  //  SOCKET & DB CONNECTION 
  useEffect(() => {
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    if (userId) {
        newSocket.emit("join-room", { 
            roomId, 
            username, 
            userId, 
            password 
        });
    }

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
            if (!newFilesState[activeFile]) {
                setActiveFile(dbFiles[0].name);
            }
        }
        if (dbMessages) setMessages(dbMessages);
    });

    newSocket.on("chat-message", (msg) => setMessages(prev => [...prev, msg]));
    newSocket.on("file-change", (fileName) => setActiveFile(fileName));

    return () => { newSocket.disconnect(); };
  }, [roomId, username, userId, password]);


  // AUTO-SAVE LOGIC 
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


  // YJS EDITOR BINDING 
  useEffect(() => {
    if (!editorRef || !socket || !files[activeFile]) return;

    if (providerRef.current) providerRef.current.destroy();
    if (docRef.current) docRef.current.destroy();
    if (bindingRef.current) bindingRef.current.destroy();

    const ydoc = new Y.Doc();
    const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
    
    const provider = new SocketIOProvider(SERVER_URL, `${roomId}-${activeFile}`, ydoc, { autoConnect: true });
    const yText = ydoc.getText('monaco');
    
    const binding = new MonacoBinding(
        yText, editorRef.getModel()!, new Set([editorRef]), provider.awareness
    );

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

  
  // --- 4. FILE OPERATIONS (Import/Export) ---
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

  const handleFileUpload = (event: any) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles) return;

    Array.from(uploadedFiles).forEach((file: any) => {
      const reader = new FileReader();
      if (file.name.match(/\.(js|ts|css|html|json|py|java|cpp|txt|md)$/)) {
         reader.onload = (e) => {
            const content = e.target?.result as string;
            // Save to DB
            socket?.emit("save-file", {
                roomId,
                fileName: file.webkitRelativePath || file.name,
                content: content
            });
            // Update UI
            setFiles((prev: any) => ({
                ...prev,
                [file.name]: { 
                    name: file.name, 
                    language: file.name.endsWith('js') ? 'javascript' : 'plaintext', 
                    value: content 
                }
            }));
         };
         reader.readAsText(file);
      }
    });
  };

  const downloadProject = async () => {
    const zip = new JSZip();
    Object.keys(files).forEach((fileName) => {
        zip.file(fileName, files[fileName].value);
    });
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `CodeSync-${roomId}.zip`);
  };

  // --- RENDER ---
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#000', overflow: 'hidden' }}>
       
       {/* 1. TOP HEADER (HUD) */}
       <header style={{ 
           height: '50px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', 
           justifyContent: 'space-between', padding: '0 20px', background: '#0a0a0a' 
       }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
             <h3 style={{ margin: 0, color: '#00f3ff', letterSpacing: '2px', fontSize: '18px' }}>CODESYNC_PROTOCOL</h3>
             <div style={{ fontSize: '10px', background: '#111', padding: '4px 8px', border: '1px solid #333', color: '#666' }}>
                ID: <span style={{ color: '#fff' }}>{roomId}</span>
             </div>
          </div>
          <button onClick={onLeave} className="btn-danger" style={{ padding: '6px 20px', fontSize: '12px' }}>
              DISCONNECT
          </button>
       </header>
      
      {/* 2. MAIN GRID */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* SIDEBAR (Left) */}
        <aside style={{ 
            width: '260px', background: '#050505', borderRight: '1px solid #333', 
            display: 'flex', flexDirection: 'column' 
        }}>
           {/* Voice Channel */}
           {socket && <AudioRoom socket={socket} roomId={roomId} />}

           {/* File Operations (Import/Export) */}
           <div style={{ padding: '10px', display: 'flex', gap: '5px', borderBottom: '1px solid #333' }}>
              <input
                type="file"
                id="folder-upload"
                // @ts-ignore
                webkitdirectory="" 
                directory="" 
                multiple 
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <label htmlFor="folder-upload" className="btn-neon" style={{ 
                  fontSize: '10px', padding: '8px', textAlign: 'center', flex: 1, cursor: 'pointer',
                  border: '1px solid #333', color: '#888'
              }}>
                  IMPORT
              </label>
              <button onClick={downloadProject} className="btn-neon" style={{ 
                  fontSize: '10px', padding: '8px', flex: 1, 
                  border: '1px solid #333', color: '#888'
              }}>
                  EXPORT
              </button>
           </div>
           
           {/* Tabs */}
           <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
              <button onClick={() => setActiveTab('files')} style={{ flex: 1, padding: '10px', background: activeTab === 'files' ? '#111' : 'transparent', color: activeTab === 'files' ? '#00f3ff' : '#666', border: 'none', cursor: 'pointer' }}>FILES</button>
              <button onClick={() => setActiveTab('chat')} style={{ flex: 1, padding: '10px', background: activeTab === 'chat' ? '#111' : 'transparent', color: activeTab === 'chat' ? '#00f3ff' : '#666', border: 'none', cursor: 'pointer' }}>COMMS</button>
           </div>

           {/* Content List */}
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
                         color: activeFile === fileName ? '#00f3ff' : '#888',
                         border: activeFile === fileName ? '1px solid #00f3ff' : '1px solid transparent',
                         display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px'
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
            
            {/* Editor Area (Top 70%) */}
            <div style={{ flex: 0.7, position: 'relative', borderBottom: '1px solid #333' }}>
              {files[activeFile] && (
                  <Editor
                      height="100%"
                      language={files[activeFile].language || 'javascript'}
                      theme="vs-dark"
                      value={files[activeFile].value}
                      onChange={handleEditorChange}
                      onMount={(editor) => setEditorRef(editor)}
                      options={{ 
                          minimap: { enabled: false }, 
                          fontSize: 14, 
                          fontFamily: 'JetBrains Mono',
                          padding: { top: 20 },
                          scrollBeyondLastLine: false,
                          automaticLayout: true
                      }}
                  />
              )}
            </div>

            {/* Interactive Terminal (Bottom 30%) */}
            <div style={{ flex: 0.3, background: '#0a0a0a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '5px 15px', background: '#111', borderBottom: '1px solid #333', fontSize: '11px', color: '#666', letterSpacing: '1px' }}>
                    TERMINAL_OUTPUT (Interactive)
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                    {socket && <Terminal socket={socket} />}
                </div>
            </div>
        </main>
      </div>
    </div>
  );
};

export default CodeEditor;