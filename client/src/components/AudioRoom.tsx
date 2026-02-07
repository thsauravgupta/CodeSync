import { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';

interface AudioRoomProps {
    socket: any;
    roomId: string;
}

const AudioRoom = ({ socket, roomId }: AudioRoomProps) => {
    const [isMuted, setIsMuted] = useState(false);
    const [peers, setPeers] = useState<any[]>([]); // Keep track of people
    const userStream = useRef<MediaStream | null>(null);
    const peersRef = useRef<any[]>([]); // Refs for persistent access

    useEffect(() => {
        // 1. Get Microphone Access
        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
            .then(stream => {
                userStream.current = stream;
                
                // Tell server we are ready for audio
                socket.emit("join-audio", roomId);

                // 2. LISTEN: When a new user joins, WE call THEM (Initiator)
                socket.on("user-joined-audio", (userId: string) => {
                    const peer = createPeer(userId, socket.id, stream);
                    peersRef.current.push({
                        peerID: userId,
                        peer,
                    });
                    setPeers((users) => [...users, userId]);
                });

                // 3. LISTEN: When SOMEONE calls US (Receiver)
                socket.on("offer", (payload: any) => {
                    const peer = addPeer(payload.signal, payload.callerID, stream);
                    peersRef.current.push({
                        peerID: payload.callerID,
                        peer,
                    });
                    setPeers((users) => [...users, payload.callerID]);
                });

                // 4. LISTEN: Receive Answer to our Offer
                socket.on("answer", (payload: any) => {
                    const item = peersRef.current.find(p => p.peerID === payload.callerID);
                    if (item) item.peer.signal(payload.signal);
                });

                // 5. LISTEN: ICE Candidates (Network paths)
                socket.on("ice-candidate", (candidate: any) => {
                    // Handled internally by simple-peer usually, but good for debugging
                });
            });

        return () => {
            // Cleanup: Stop mic and disconnect peers
            userStream.current?.getTracks().forEach(track => track.stop());
            socket.off("user-joined-audio");
            socket.off("offer");
            socket.off("answer");
            socket.off("ice-candidate");
        };
    }, []);

    // --- Helper 1: Create a Call (Initiator) ---
    function createPeer(userToCall: string, callerID: string, stream: MediaStream) {
        const peer = new SimplePeer({
            initiator: true,
            trickle: false,
            stream,
        });

        peer.on("signal", (signal: any) => {
            socket.emit("offer", { target: userToCall, callerID, signal });
        });
        
        // When we hear their audio, create an invisible <audio> tag
        peer.on("stream", (stream: any) => {
            const audio = document.createElement('audio');
            audio.srcObject = stream;
            audio.play();
        });

        return peer;
    }

    // --- Helper 2: Answer a Call (Receiver) ---
    function addPeer(incomingSignal: any, callerID: string, stream: MediaStream) {
        const peer = new SimplePeer({
            initiator: false,
            trickle: false,
            stream,
        });

        peer.on("signal", (signal: any) => {
            socket.emit("answer", { target: callerID, callerID: socket.id, signal });
        });

        peer.on("stream", (stream: any) => {
            const audio = document.createElement('audio');
            audio.srcObject = stream;
            audio.play();
        });

        peer.signal(incomingSignal);
        return peer;
    }

    const toggleMute = () => {
        if (userStream.current) {
            userStream.current.getAudioTracks()[0].enabled = !userStream.current.getAudioTracks()[0].enabled;
            setIsMuted(!isMuted);
        }
    };

    return (
        <div style={{ padding: '15px', borderBottom: '1px solid #333', background: '#181818' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#aaa' }}>VOICE CHANNEL</span>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#28a745', boxShadow: '0 0 5px #28a745' }}></div>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                    onClick={toggleMute}
                    style={{ 
                        flex: 1, padding: '8px', borderRadius: '4px', border: 'none', 
                        background: isMuted ? '#ff4d4d' : '#333', color: '#fff', cursor: 'pointer',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px'
                    }}
                >
                    {isMuted ? "🔇 Unmute" : "🎙️ Mute"}
                </button>
                <div style={{ fontSize: '12px', color: '#666' }}>
                    {peers.length > 0 ? `${peers.length} Peer(s)` : "Waiting..."}
                </div>
            </div>
        </div>
    );
};

export default AudioRoom;