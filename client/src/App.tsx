import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

function App() {
  const [editorRef, setEditorRef] = useState<any>(null);

  // 1. Initialize the Editor instance
  const handleEditorDidMount = (editor: any, _monaco: any) => {
    setEditorRef(editor);
  };

  useEffect(() => {
    if (!editorRef) return;

    // 2. Initialize Yjs Document
    // A "Doc" is the shared data structure
    const ydoc = new Y.Doc();

    // 3. Connect to the Server (WebsocketProvider)
    // "monaco-demo" is the room name. 
    const provider = new WebsocketProvider(
      'ws://localhost:3001', 
      'room-123', 
      ydoc
    );

    // 4. Create a shared text type
    const yText = ydoc.getText('monaco');

    // 5. Bind Yjs to Monaco
    // This automatically syncs text and cursors!
    const binding = new MonacoBinding(
      yText, 
      editorRef.getModel()!, 
      new Set([editorRef]), 
      provider.awareness
    );

    console.log("Connected to Yjs Room");

    return () => {
      provider.destroy();
      ydoc.destroy();
      binding.destroy();
    };
  }, [editorRef]);

  return (
    <div className="App" style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
       <div style={{ padding: '10px', background: '#1e1e1e', color: '#fff', borderBottom: '1px solid #333' }}>
        <h3>CodeSync - Room: 123 (CRDT Active)</h3>
      </div>
      <Editor
        height="90vh"
        defaultLanguage="javascript"
        theme="vs-dark"
        // Note: We removed 'value' and 'onChange'. 
        // Yjs handles that directly now via the Binding.
        onMount={handleEditorDidMount}
        options={{ minimap: { enabled: false }, fontSize: 14 }}
      />
    </div>
  );
}

export default App;