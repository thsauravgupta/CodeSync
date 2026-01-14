import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import io from 'socket.io-client';

// Connect to the backend
const socket = io("http://localhost:3001");

function App() {
  const [code, setCode] = useState<string>("// Start typing your code here...");

  useEffect(() => {
    // Test: Send a "join-room" event to the server
    socket.emit("join-room", "room-123");
  }, []);

  const handleEditorChange = (value: string | undefined) => {
    setCode(value || "");
  };

  return (
    <div className="App" style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      <div style={{ padding: '10px', background: '#1e1e1e', color: '#fff', borderBottom: '1px solid #333' }}>
        <h3>CodeSync - Room: 123</h3>
      </div>
      <Editor
        height="90vh"
        defaultLanguage="javascript"
        theme="vs-dark"
        value={code}
        onChange={handleEditorChange}
        options={{ minimap: { enabled: false }, fontSize: 14 }}
      />
    </div>
  );
}

export default App;