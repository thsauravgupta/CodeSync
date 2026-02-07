import { useState, useEffect } from 'react';
import Lobby from './components/Lobby';
import CodeEditor from './components/codeEditor';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
function App() {
  const [user, setUser] = useState<any>(null);
  const [step, setStep] = useState<"lobby" | "editor">("lobby");
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);

  // Check for existing login on load
  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData: any) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setStep("lobby");
  };

  const handleJoin = (newRoomId: string, newPassword?: string) => {
    setRoomId(newRoomId);
    if (newPassword) setPassword(newPassword);
    setStep("editor");
  };

  if (loading) return <div style={{ background: '#000', height: '100vh' }}></div>;

  // LOGIN SCREEN (Shows Matrix Background)
  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  // LOBBY SCREEN (Clean Dark Background)
  if (step === "lobby") {
    return (
      <Dashboard 
        user={user} 
        onJoin={handleJoin} 
        onLogout={handleLogout} 
      />
    );
  }

  // 3. EDITOR SCREEN (HUD Interface)
  return (
    <CodeEditor 
      roomId={roomId} 
      username={user.name} 
      userId={user.id} 
      password={password}
      onLeave={() => setStep("lobby")} 
    />
  );
}

export default App;