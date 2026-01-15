import { useState, useEffect, useRef } from 'react';

interface ChatProps {
  socket: any;
  roomId: string;
  username: string;
}

const Chat = ({ socket, roomId, username }: ChatProps) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [currentMsg, setCurrentMsg] = useState("");
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    // Listen for incoming messages
    socket.on("chat-message", (data: any) => {
      setMessages((prev) => [...prev, data]);
      scrollToBottom();
    });

    return () => {
      socket.off("chat-message");
    };
  }, [socket]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = () => {
    if (currentMsg.trim() === "") return;

    const msgData = {
      roomId,
      username,
      text: currentMsg,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Send to server
    socket.emit("chat-message", msgData);
    
    // Update my own UI immediately
    setMessages((prev) => [...prev, msgData]);
    setCurrentMsg("");
    scrollToBottom();
  };

  const toggleVoice = () => {

     setIsVoiceActive(!isVoiceActive);
     alert("Voice Logic will be activated in the next step!");
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111', borderLeft: '1px solid #333' }}>
      
      {/* Voice Room Header */}
      <div style={{ padding: '10px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e1e1e' }}>
         <span style={{ fontWeight: 'bold' }}>Voice Room</span>
         <button 
           onClick={toggleVoice}
           style={{ 
             padding: '5px 10px', 
             borderRadius: '20px', 
             border: 'none', 
             background: isVoiceActive ? '#28a745' : '#444', 
             color: '#fff', 
             cursor: 'pointer',
             fontSize: '12px',
             display: 'flex', alignItems: 'center', gap: '5px'
           }}
         >
           {isVoiceActive ? "● On Air" : "Join Audio"}
         </button>
      </div>

      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ 
            alignSelf: msg.username === username ? 'flex-end' : 'flex-start',
            maxWidth: '80%',
            background: msg.username === username ? '#007acc' : '#333',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            <div style={{ fontSize: '10px', color: '#ccc', marginBottom: '2px' }}>{msg.username}</div>
            <div>{msg.text}</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', textAlign: 'right', marginTop: '2px' }}>{msg.time}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ padding: '10px', borderTop: '1px solid #333', display: 'flex', gap: '5px' }}>
        <input 
          type="text" 
          value={currentMsg} 
          onChange={(e) => setCurrentMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
        />
        <button onClick={sendMessage} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' }}>🚀</button>
      </div>
    </div>
  );
};

export default Chat;