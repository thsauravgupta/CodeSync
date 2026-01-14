import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { SocketIOProvider } from 'y-socket.io';
import { MonacoBinding } from 'y-monaco';
import io from 'socket.io-client';

interface CodeEditorProps {
  roomId: string;
  username: string;
  onLeave: () => void;
}

const CodeEditor = ({ roomId, username, onLeave }: CodeEditorProps) => {
  const [editorRef, setEditorRef] = useState<any>(null);
  const [code, setCode] = useState(""); 
  const [output, setOutput] = useState(""); 
  const [language, setLanguage] = useState("javascript"); 
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!editorRef) return;

    const ydoc = new Y.Doc();
    const socket = io("http://localhost:3001");
    const provider = new SocketIOProvider("http://localhost:3001", roomId, ydoc, { autoConnect: true });
    
    const yText = ydoc.getText('monaco');
    const binding = new MonacoBinding(
        yText, editorRef.getModel()!, new Set([editorRef]), provider.awareness
    );
    
    provider.awareness.setLocalStateField('user', {
        name: username,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    });

    yText.observe(event => setCode(yText.toString()));

    return () => {
      provider.destroy();
      ydoc.destroy();
      binding.destroy();
      socket.disconnect();
    };
  }, [editorRef, roomId, username]);

  const runCode = async () => {
    setIsRunning(true);
    try {
        const response = await fetch("http://localhost:3001/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, language })
        });
        const data = await response.json();
        setOutput(data.output);
    } catch (error) {
        setOutput("Failed to connect to Docker Engine");
    } finally {
        setIsRunning(false);
    }
  };

  return (
    <div className="App" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d', color: '#fff' }}>
       {/* Toolbar */}
       <div style={{ padding: '10px 20px', background: '#1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
             <h3 style={{ margin: 0, color: '#61dafb' }}>CodeSync</h3>
             <span style={{ fontSize: '12px', background: '#333', padding: '4px 8px', borderRadius: '4px', color: '#aaa' }}>
                Room: {roomId}
             </span>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                style={{ padding: '6px', background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
            >
                <option value="javascript">JavaScript</option>
                <option value="python">Python 3</option>
            </select>
            
            <button 
                onClick={runCode} 
                disabled={isRunning}
                style={{ padding: '6px 16px', background: isRunning ? '#666' : '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
                {isRunning ? "Running..." : "Run ▶"}
            </button>
            <button onClick={onLeave} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}>Leave</button>
          </div>
      </div>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 2, borderRight: '1px solid #333' }}>
            <Editor
                height="100%"
                language={language}
                theme="vs-dark"
                onMount={(editor) => setEditorRef(editor)}
                options={{ minimap: { enabled: false }, fontSize: 16, padding: { top: 20 } }}
            />
        </div>
        <div style={{ flex: 1, background: '#111', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px', background: '#222', borderBottom: '1px solid #333', fontWeight: 'bold' }}>Terminal Output</div>
            <pre style={{ padding: '15px', color: '#0f0', fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowY: 'auto' }}>
                {output || "Waiting for output..."}
            </pre>
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;