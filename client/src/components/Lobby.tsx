import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

interface LobbyProps {
  onJoin: (room: string, username: string) => void;
}

const Lobby = ({ onJoin }: LobbyProps) => {
  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState("");

  const createRoom = () => {
    const newRoomId = uuidv4().slice(0, 8);
    onJoin(newRoomId, username || "Guest");
  };

  const joinRoom = () => {
    if (roomId) onJoin(roomId, username || "Guest");
  };

  return (
    <div style={{ 
      height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', 
      background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', color: '#fff' 
    }}>
      <div style={{ 
        padding: '40px', background: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(10px)', 
        borderRadius: '15px', border: '1px solid rgba(255,255,255,0.1)', width: '300px', textAlign: 'center' 
      }}>
        <h1 style={{ marginBottom: '20px', background: 'linear-gradient(to right, #00c6ff, #0072ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          CodeSync
        </h1>
        
        <input 
          type="text" placeholder="Enter Username" value={username} onChange={e => setUsername(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '5px', border: 'none', background: '#333', color: '#fff' }} 
        />
        <input 
          type="text" placeholder="Enter Room ID" value={roomId} onChange={e => setRoomId(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '5px', border: 'none', background: '#333', color: '#fff' }} 
        />

        <button onClick={joinRoom} style={{ width: '100%', padding: '10px', background: '#0072ff', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', marginBottom: '10px' }}>
          Join Room
        </button>
        <button onClick={createRoom} style={{ width: '100%', padding: '10px', background: 'transparent', color: '#aaa', border: '1px solid #555', borderRadius: '5px', cursor: 'pointer' }}>
          Create New Room
        </button>
      </div>
    </div>
  );
};

export default Lobby;