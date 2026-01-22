import { useState } from 'react';
import Lobby from './components/Lobby';
import CodeEditor from './components/codeEditor';
import { useUser, UserButton } from "@clerk/clerk-react"; // Import hooks

function App() {
  const [step, setStep] = useState<"lobby" | "editor">("lobby");
  const [roomId, setRoomId] = useState("");
  const { user } = useUser(); // Access the logged-in user

  const handleJoin = (newRoomId: string) => {
    setRoomId(newRoomId);
    setStep("editor");
  };

  const handleLeave = () => {
    setStep("lobby");
    setRoomId("");
  };

  if (step === "lobby") {
    return <Lobby onJoin={handleJoin} />;
  }

  return (
    <CodeEditor 
      roomId={roomId} 
      // Pass real Google data here!
      username={user?.fullName || "Guest"} 
      avatar={user?.imageUrl} // We will use this in the next step!
      onLeave={handleLeave} 
    />
  );
}

export default App;