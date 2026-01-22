import { useEffect, useRef } from 'react';

interface ChatProps {
  socket: any;
  roomId: string;
  username: string;
  messages: any[]; // Received from parent
  setMessages: React.Dispatch<React.SetStateAction<any[]>>; // To update parent state
}

const Chat = ({ socket, roomId, username, messages, setMessages }: ChatProps) => {
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    const input = inputRef.current;
    if (!input || input.value.trim() === "") return;

    const msgData = {
      roomId,
      username,
      text: input.value,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // 1. Send to Server (Broadcast to others)
    socket.emit("chat-message", msgData);
    
    // 2. Update Local State (Show it to myself)
    setMessages((prev) => [...prev, msgData]);
    
    input.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') sendMessage();
  };

  return (
    <div className="flex-col" style={{ height: '100%', background: '#111' }}>
      
      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ 
            alignSelf: msg.username === username ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: msg.username === username ? '#007acc' : '#252526',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #333'
          }}>
            <div style={{ fontSize: '11px', color: '#ccc', marginBottom: '2px', fontWeight: 'bold' }}>
              {msg.username}
            </div>
            <div style={{ fontSize: '14px', color: '#e0e0e0', wordBreak: 'break-word' }}>
              {msg.text}
            </div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', textAlign: 'right', marginTop: '4px' }}>
              {msg.time}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ padding: '10px', borderTop: '1px solid #333', background: '#181818', display: 'flex', gap: '8px' }}>
        <input 
          ref={inputRef}
          type="text" 
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          style={{ 
            flex: 1, 
            padding: '10px', 
            borderRadius: '4px', 
            border: '1px solid #333', 
            background: '#0d0d0d', 
            color: '#fff',
            outline: 'none'
          }}
        />
        <button 
          onClick={sendMessage} 
          className="btn-primary" 
          style={{ padding: '0 15px', fontSize: '1.2rem' }}
        >
          ➤
        </button>
      </div>
    </div>
  );
};

export default Chat;