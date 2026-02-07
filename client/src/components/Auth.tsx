import { useState } from 'react';
import MatrixBackground from './MatrixBackground'; // Import the background

interface AuthProps {
    onLogin: (user: any) => void;
}

const Auth = ({ onLogin }: AuthProps) => {
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        const endpoint = isRegister ? "/register" : "/login";
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
        
        try {
            const res = await fetch(`${SERVER_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, name })
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem("user", JSON.stringify(data.user));
                onLogin(data.user);
            } else {
                setError(data.error);
            }
        } catch (err) { setError("Server unreachable"); }
    };

    return (
        <div style={{ position: 'relative', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MatrixBackground /> {/* The Live Code Background */}
            
            <div className="glass-card">
                <h1 style={{ 
                    margin: '0 0 20px 0', 
                    textShadow: '0 0 10px rgba(0, 243, 255, 0.7)',
                    color: '#fff' 
                }}>
                    {isRegister ? "INITIALIZE_USER" : "SYSTEM_LOGIN"}
                </h1>

                {error && <div style={{ color: '#ff00ff', marginBottom: '15px', textShadow: '0 0 5px #ff00ff' }}>⚠ {error}</div>}

                <form onSubmit={handleSubmit}>
                    {isRegister && <input type="text" placeholder="CODENAME (Name)" value={name} onChange={e => setName(e.target.value)} required />}
                    <input type="email" placeholder="EMAIL_ID" value={email} onChange={e => setEmail(e.target.value)} required />
                    <input type="password" placeholder="ACCESS_KEY (Password)" value={password} onChange={e => setPassword(e.target.value)} required />
                    
                    <button type="submit" className="btn-neon">
                        {isRegister ? "EXECUTE REGISTER" : "ACCESS MAINFRAME"}
                    </button>
                </form>

                <p style={{ marginTop: '20px', fontSize: '12px', color: '#888' }}>
                    {isRegister ? "ALREADY IN SYSTEM? " : "NO ACCESS KEY? "}
                    <span 
                        onClick={() => setIsRegister(!isRegister)} 
                        style={{ color: 'var(--neon-cyan)', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        {isRegister ? "LOGIN" : "REGISTER"}
                    </span>
                </p>
            </div>
        </div>
    );
};

export default Auth;