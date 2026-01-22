import { useState } from 'react';
import Lobby from './components/Lobby';
import CodeEditor from './components/codeEditor';

function App() {
  const [step, setStep] = useState<"lobby" | "editor">("lobby");
  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState("");

  const handleJoin = (newRoomId: string, newUsername: string) => {
    setRoomId(newRoomId);
    setUsername(newUsername);
    setStep("editor");
  };

  const handleLeave = () => {
    setStep("lobby");
    setRoomId("");
    setUsername("");
  };

  if (step === "lobby") {
    return <Lobby onJoin={handleJoin} />;
  }

  return (
    <CodeEditor 
      roomId={roomId} 
      username={username} 
      onLeave={handleLeave} 
    />
  );
}

export default App;