import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MatrixBackground from './MatrixBackground'; // Import the cool background

interface LobbyProps {
  onJoin: (room: string, password?: string) => void;
}

const Lobby = ({ onJoin }: LobbyProps) => {
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false); // Animation state

  const createRoom = () => {
    setIsCreating(true);
    // Add a small "hacking" delay effect
    setTimeout(() => {
        const newRoomId = uuidv4().slice(0, 8).toUpperCase(); // Capitalize for effect
        onJoin(newRoomId, password);
    }, 800);
  };

  const handleJoin = () => {
      if (!roomId) return;
      onJoin(roomId, password);
  }

  return (
    <div style={{ position: 'relative', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
       {/* 1. The Falling Code Background */}
       <MatrixBackground />
       
       {/* 2. The Glass Card */}
       <div className="glass-card" style={{ width: '400px', textAlign: 'left', position: 'relative', zIndex: 10 }}>
          
          {/* Header */}
          <div style={{ marginBottom: '30px', borderBottom: '1px solid rgba(0, 243, 255, 0.3)', paddingBottom: '10px' }}>
             <h1 style={{ 
                margin: 0, 
                fontSize: '2rem', 
                color: '#fff', 
                textShadow: '0 0 10px rgba(0, 243, 255, 0.8)',
                letterSpacing: '3px'
             }}>
                PROTOCOL: LOBBY
             </h1>
             <div style={{ fontSize: '10px', color: 'var(--neon-cyan)', marginTop: '5px' }}>
                 SYSTEM_STATUS: <span style={{ color: '#0f0' }}>ONLINE</span>
             </div>
          </div>

          {/* Inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                  <label style={{ fontSize: '12px', color: '#888', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>TARGET_ROOM_ID</label>
                  <input 
                    type="text" 
                    placeholder="ENTER ID..." 
                    value={roomId} 
                    onChange={e => setRoomId(e.target.value)}
                    style={{ fontSize: '16px', letterSpacing: '2px', fontFamily: 'monospace' }}
                  />
              </div>

              <div>
                  <label style={{ fontSize: '12px', color: '#888', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>ENCRYPTION_KEY (OPTIONAL)</label>
                  <input 
                    type="password" 
                    placeholder="PASSCODE..." 
                    value={password} 
                    onChange={e => setPassword(e.target.value)}
                  />
              </div>
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: '40px', display: 'flex', gap: '15px' }}>
            <button onClick={handleJoin} className="btn-neon">
                JOIN_NETWORK
            </button>
            <button onClick={createRoom} className="btn-neon" style={{ borderColor: 'var(--neon-green)', color: 'var(--neon-green)' }}>
                {isCreating ? "INITIALIZING..." : "NEW_SERVER"}
            </button>
          </div>
          
          {/* Decorative Footer */}
          <div style={{ marginTop: '30px', fontSize: '9px', color: '#444', textAlign: 'center', fontFamily: 'monospace' }}>
             SECURE_CONNECTION_ESTABLISHED_V2.0
          </div>
       </div>
    </div>
  );
};

export default Lobby;