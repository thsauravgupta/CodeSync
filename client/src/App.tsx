import { useState, useEffect } from 'react';
import Lobby from './components/Lobby';
import CodeEditor from './components/codeEditor';
import Auth from './components/Auth';

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
      <div style={{ height: '100vh', background: '#050505', position: 'relative' }}>
         <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: '15px', zIndex: 10 }}>
            <span style={{ color: '#888', fontFamily: 'monospace' }}>OPERATOR: <span style={{ color: '#fff' }}>{user.name}</span></span>
            <button onClick={handleLogout} className="btn-danger" style={{ padding: '5px 15px', fontSize: '12px' }}>LOGOUT</button>
         </div>
         <Lobby onJoin={handleJoin} />
      </div>
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