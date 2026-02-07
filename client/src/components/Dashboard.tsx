import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import io from 'socket.io-client';

// --- ICONS (Industrial / Raw) ---
const Icons = {
    Plus: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>,
    Zap: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    Box: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    Clock: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    Users: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
};

interface DashboardProps {
    user: any;
    onJoin: (roomId: string, password?: string) => void;
    onLogout: () => void;
}

const Dashboard = ({ user, onJoin, onLogout }: DashboardProps) => {
    const [projects, setProjects] = useState<any[]>([]);
    const [showJoinInput, setShowJoinInput] = useState(false);
    const [joinId, setJoinId] = useState("");
    
    // REAL-TIME METRICS
    const [stats, setStats] = useState({ activeUsers: 1, activeRooms: 0, latency: 0 });
    const [activityLog, setActivityLog] = useState<string[]>([]);
    const socketRef = useRef<any>(null);

    // 1. KEYBOARD SHORTCUTS (Power User Feature)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                handleCreate();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // 2. CONNECT TO DASHBOARD SOCKET (Real Data)
    useEffect(() => {
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
        const socket = io(SERVER_URL);
        socketRef.current = socket;

        socket.emit("join-dashboard");

        socket.on("system-stats", (data) => {
            setStats(prev => ({ ...prev, ...data }));
        });

        socket.on("activity-log", (data) => {
            setActivityLog(prev => [data.text, ...prev].slice(0, 5)); // Keep last 5
        });

        // Ping for Latency
        const start = Date.now();
        socket.emit("ping");
        socket.on("pong", () => {
            setStats(prev => ({ ...prev, latency: Date.now() - start }));
        });

        return () => { socket.disconnect(); };
    }, []);

    // 3. FETCH PROJECTS
    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
                const res = await fetch(`${SERVER_URL}/projects/${user.id}`);
                const data = await res.json();
                if (Array.isArray(data)) setProjects(data);
            } catch (e) { console.error(e); }
        };
        fetchProjects();
    }, [user.id]);

    const handleCreate = async () => {
        const name = prompt("SYSTEM: Enter Workspace Name");
        if (!name) return;
        const newRoomId = uuidv4().slice(0, 8).toUpperCase();
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
        
        await fetch(`${SERVER_URL}/projects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, name, roomId: newRoomId })
        });
        onJoin(newRoomId);
    };

    const handleDelete = async (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation();
        if (!confirm("Confirm Deletion?")) return;
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
        await fetch(`${SERVER_URL}/projects/${projectId}`, { method: "DELETE" });
        setProjects(prev => prev.filter(p => p.id !== projectId));
    };

    return (
        <div style={{ height: '100vh', background: '#050505', color: '#e0e0e0', display: 'flex', fontFamily: '"JetBrains Mono", monospace', overflow: 'hidden' }}>
            <style>{`
                @keyframes pulse-border { 0% { border-color: #00f3ff; box-shadow: 0 0 10px rgba(0,243,255,0.1); } 50% { border-color: rgba(0,243,255,0.5); box-shadow: 0 0 20px rgba(0,243,255,0.3); } 100% { border-color: #00f3ff; box-shadow: 0 0 10px rgba(0,243,255,0.1); } }
                .hero-btn { background: rgba(0,243,255,0.08); border: 1px solid #00f3ff; color: #00f3ff; transition: 0.2s; animation: pulse-border 3s infinite; }
                .hero-btn:hover { background: #00f3ff; color: #000; transform: translateY(-2px); box-shadow: 0 0 30px rgba(0,243,255,0.5); }
                .sidebar-link { padding: 10px 15px; display: flex; align-items: center; gap: 12px; color: #666; font-size: 13px; cursor: pointer; transition: 0.2s; border-radius: 4px; }
                .sidebar-link:hover, .sidebar-link.active { background: #111; color: #fff; }
                .sidebar-link.active { border-left: 2px solid #00f3ff; }
                .project-card:hover { border-color: #666; transform: translateY(-2px); }
                .project-card:hover .action-bar { opacity: 1; }
            `}</style>

            {/* --- 1. SIDEBAR (Productized Labels) --- */}
            <div style={{ width: '250px', borderRight: '1px solid #222', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '12px', height: '12px', background: '#00f3ff', borderRadius: '2px' }}></div>
                    CODESYNC
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div className="sidebar-link active"><Icons.Box /> Workspaces</div>
                    <div className="sidebar-link"><Icons.Clock /> Timeline</div>
                    <div className="sidebar-link"><Icons.Users /> Collaborators</div>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #222' }}>
                    <div style={{ fontSize: '12px', color: '#444', marginBottom: '8px' }}>CONNECTED AS</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fff' }}>
                        <div style={{ width: '24px', height: '24px', background: '#333', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                            {user.name[0]}
                        </div>
                        {user.name}
                    </div>
                </div>
            </div>

            {/* --- 2. MAIN CONTENT --- */}
            <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
                
                {/* HERO SECTION (Dominant Intent) */}
                <div style={{ display: 'flex', gap: '20px', marginBottom: '50px' }}>
                    
                    {/* Primary Action */}
                    <button onClick={handleCreate} className="hero-btn" style={{ 
                        flex: 2, height: '140px', padding: '30px', borderRadius: '6px', 
                        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px', cursor: 'pointer', textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Icons.Plus />
                                <span style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px' }}>NEW WORKSPACE</span>
                            </div>
                            <span style={{ fontSize: '10px', padding: '4px 8px', border: '1px solid rgba(0,243,255,0.5)', borderRadius: '4px', color: '#00f3ff' }}>⌘ + N</span>
                        </div>
                        <span style={{ opacity: 0.7, fontSize: '13px', maxWidth: '300px' }}>Initialize a new high-performance coding environment.</span>
                    </button>

                    {/* Secondary Action */}
                    <div style={{ flex: 1, border: '1px solid #333', borderRadius: '6px', background: '#0a0a0a', padding: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                         {!showJoinInput ? (
                             <button onClick={() => setShowJoinInput(true)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                 <Icons.Zap /> Join Session
                             </button>
                         ) : (
                             <div style={{ display: 'flex', gap: '5px' }}>
                                 <input autoFocus placeholder="ROOM ID" value={joinId} onChange={e => setJoinId(e.target.value)} style={{ background: '#000', border: '1px solid #333', color: '#fff', padding: '10px', width: '100%', outline: 'none' }} />
                                 <button onClick={() => onJoin(joinId)} style={{ background: '#fff', border: 'none', padding: '0 15px', cursor: 'pointer', fontWeight: 'bold' }}>GO</button>
                             </div>
                         )}
                    </div>
                </div>

                {/* PROJECTS GRID */}
                <h3 style={{ fontSize: '12px', color: '#666', letterSpacing: '1px', marginBottom: '20px' }}>RECENT WORKSPACES</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                    {projects.map(p => (
                        <div key={p.id} className="project-card" style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '6px', padding: '20px', position: 'relative', transition: '0.2s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{p.name}</span>
                                <span style={{ fontSize: '10px', color: '#666', fontFamily: 'monospace' }}>{p.roomId}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666' }}>
                                    <Icons.Clock /> {new Date(p.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                            
                            {/* HOVER ACTIONS */}
                            <div className="action-bar" style={{ 
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                                background: 'rgba(5,5,5,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                opacity: 0, transition: '0.2s'
                            }}>
                                <button onClick={() => onJoin(p.roomId)} style={{ background: '#fff', border: 'none', padding: '8px 20px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' }}>RESUME</button>
                                <button onClick={(e) => handleDelete(e, p.id)} style={{ background: 'rgba(255,0,0,0.2)', border: '1px solid red', padding: '8px', color: 'red', cursor: 'pointer', borderRadius: '4px' }}><Icons.Trash /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- 3. RIGHT PANEL (Live Telemetry) --- */}
            <div style={{ width: '280px', borderLeft: '1px solid #222', background: '#080808', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', background: '#00ff41', borderRadius: '50%', boxShadow: '0 0 8px #00ff41' }}></div>
                    SYSTEM_TELEMETRY
                </div>

                {/* Stat Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '30px' }}>
                    <div style={{ background: '#111', padding: '15px', borderRadius: '4px' }}>
                        <div style={{ fontSize: '10px', color: '#666', marginBottom: '5px' }}>ACTIVE USERS</div>
                        <div style={{ fontSize: '20px', color: '#fff' }}>{stats.activeUsers}</div>
                    </div>
                    <div style={{ background: '#111', padding: '15px', borderRadius: '4px' }}>
                        <div style={{ fontSize: '10px', color: '#666', marginBottom: '5px' }}>LATENCY</div>
                        <div style={{ fontSize: '20px', color: stats.latency < 50 ? '#00ff41' : 'orange' }}>{stats.latency || '-'}ms</div>
                    </div>
                </div>

                {/* Live Feed */}
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>GLOBAL_EVENT_STREAM</div>
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {activityLog.length === 0 ? <span style={{ opacity: 0.3, fontSize: '12px' }}>...listening for events...</span> : 
                        activityLog.map((log, i) => (
                            <div key={i} style={{ fontSize: '11px', borderLeft: '2px solid #333', paddingLeft: '10px', color: '#888' }}>
                                {log}
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
};

export default Dashboard;