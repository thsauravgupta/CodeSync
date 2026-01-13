import { useState } from 'react';
import Editor from '@monaco-editor/react';

function App() {
  const [code, setCode] = useState<string>("// Start typing your code here...");

  // FIX: We removed ': OnChange' and typed 'value' directly.
  // Monaco sends the new code as a string, or undefined if something goes wrong.
  const handleEditorChange = (value: string | undefined) => {
    setCode(value || "");
    console.log("Current Code:", value);
  };

  return (
    <div className="App" style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      <div style={{ padding: '10px', background: '#1e1e1e', color: '#fff', borderBottom: '1px solid #333' }}>
        <h3>CodeSync - Room: 123 (TS Mode)</h3>
      </div>
      
      <Editor
        height="90vh"
        defaultLanguage="javascript"
        theme="vs-dark"
        value={code}
        onChange={handleEditorChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
        }}
      />
    </div>
  );
}

export default App;