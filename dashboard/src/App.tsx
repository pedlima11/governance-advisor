import { useState } from 'react';
import { sampleSnapshot, tuningWindows } from './data/sampleSnapshot';
import { generatePlaybooks } from './utils/scoring';
import { GovernanceHeader } from './components/GovernanceHeader';
import { TuningWindows } from './components/TuningWindows';
import { StatusPanel } from './components/StatusPanel';
import { ErrorRanking } from './components/ErrorRanking';
import { PlaybookPanel } from './components/PlaybookPanel';
import { LoginScreen } from './components/LoginScreen';
import { Shield, Wifi, WifiOff, RefreshCw, LogOut } from 'lucide-react';
import { fetchSnapshot, type Credentials } from './services/netsuiteApi';

function App() {
  const [snapshot, setSnapshot] = useState(sampleSnapshot);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [creds, setCreds] = useState<Credentials | null>(null);

  const windows = tuningWindows;
  const playbooks = generatePlaybooks(snapshot, windows);
  const bestWindow = windows.reduce((a, b) => a.score < b.score ? a : b, windows[0]);
  const currentWindow = windows[windows.length - 1];

  const handleLogin = async (credentials: Credentials) => {
    // Skip button — use sample data
    if (!credentials.restletUrl) {
      setLoggedIn(true);
      setIsLive(false);
      return;
    }

    const data = await fetchSnapshot(credentials);
    setSnapshot(data);
    setCreds(credentials);
    setIsLive(true);
    setLoggedIn(true);
  };

  const handleRefresh = async () => {
    if (!creds) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSnapshot(creds);
      setSnapshot(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setIsLive(false);
    setCreds(null);
    setSnapshot(sampleSnapshot);
    setError(null);
  };

  if (!loggedIn) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <Shield size={28} />
          <div>
            <h1>Adaptive Governance Advisor</h1>
            <span className="app-subtitle">
              Última coleta: {new Date(snapshot.collectedAt).toLocaleString('pt-BR')}
              {' · '}
              {isLive ? (
                <span style={{ color: 'var(--green)' }}><Wifi size={12} style={{ verticalAlign: 'middle' }} /> Ao vivo</span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}><WifiOff size={12} style={{ verticalAlign: 'middle' }} /> Dados sample</span>
              )}
              {isLive && (
                <>
                  {' '}
                  <button
                    onClick={handleRefresh}
                    disabled={loading}
                    style={{
                      background: 'none', border: 'none', color: 'var(--blue)',
                      cursor: loading ? 'wait' : 'pointer', padding: '2px',
                      verticalAlign: 'middle',
                    }}
                  >
                    <RefreshCw size={12} className={loading ? 'spin' : ''} />
                  </button>
                </>
              )}
              {' '}
              <button
                onClick={handleLogout}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: '2px', verticalAlign: 'middle',
                }}
                title="Desconectar"
              >
                <LogOut size={12} />
              </button>
            </span>
            {error && <span className="app-subtitle" style={{ color: 'var(--red)' }}>Erro: {error}</span>}
          </div>
        </div>
      </header>

      <main className="app-main">
        <GovernanceHeader snapshot={snapshot} />
        <TuningWindows windows={windows} />
        <StatusPanel
          snapshot={snapshot}
          bestWindow={bestWindow}
          currentWindow={currentWindow}
        />
        <PlaybookPanel playbooks={playbooks} />
        <ErrorRanking errors={snapshot.errors} />
      </main>
    </div>
  );
}

export default App;
