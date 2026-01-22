import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useUser, SignInButton } from "@clerk/clerk-react"; 

interface LobbyProps {
  onJoin: (room: string, password?: string) => void; // Update signature
}

const Lobby = ({ onJoin }: LobbyProps) => {
  const [roomId, setRoomId] = useState("");
  const [password, setPassword] = useState(""); // NEW
  const { isSignedIn, user, isLoaded } = useUser();

  const createRoom = () => {
    const newRoomId = uuidv4().slice(0, 8);
    // When creating, we join with the password (if typed)
    onJoin(newRoomId, password);
  };

  const joinRoom = () => {
    if (roomId) onJoin(roomId, password);
  };

  if (!isLoaded) return <div style={{color:'#fff', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Loading...</div>;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f0c29' }}>
       <h1 style={{ fontSize: '3rem', background: '-webkit-linear-gradient(#00c6ff, #0072ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 20px 0' }}>
          CodeSync
       </h1>
       
       <div style={{ 
          padding: '30px', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', 
          borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', width: '320px', display: 'flex', flexDirection: 'column', gap: '15px'
       }}>
         
         {!isSignedIn ? (
            <div style={{textAlign:'center'}}>
              <SignInButton mode="modal">
                <button className="btn btn-primary" style={{width:'100%', padding:'12px'}}>Login with Google</button>
              </SignInButton>
            </div>
         ) : (
            <>
              <div style={{display:'flex', alignItems:'center', gap:'10px', color:'#fff', marginBottom:'10px'}}>
                 <img src={user.imageUrl} style={{width:'32px', borderRadius:'50%'}} alt=""/>
                 <span>{user.fullName}</span>
              </div>

              <input 
                type="text" placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)}
                style={{ padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
              />
              
              {/* NEW PASSWORD FIELD */}
              <input 
                type="password" placeholder="Room Password (Optional)" value={password} onChange={e => setPassword(e.target.value)}
                style={{ padding: '10px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
              />

              <div style={{display:'flex', gap:'10px'}}>
                <button onClick={joinRoom} className="btn btn-primary" style={{flex:1, background: '#0072ff'}}>Join</button>
                <button onClick={createRoom} className="btn" style={{flex:1, background: '#333', color:'#fff'}}>Create</button>
              </div>
            </>
         )}
       </div>
    </div>
  );
};

export default Lobby;