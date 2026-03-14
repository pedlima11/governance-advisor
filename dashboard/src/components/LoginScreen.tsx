import { useState } from 'react';
import { Shield, Eye, EyeOff, LogIn } from 'lucide-react';
import type { Credentials } from '../services/netsuiteApi';

interface Props {
  onLogin: (credentials: Credentials) => Promise<void>;
}

const STORAGE_KEY = 'adv_gov_credentials';

function loadSaved(): Partial<Credentials> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCredentials(c: Credentials) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

export function LoginScreen({ onLogin }: Props) {
  const saved = loadSaved();
  const [restletUrl, setRestletUrl] = useState(saved?.restletUrl ?? '');
  const [accountId, setAccountId] = useState(saved?.accountId ?? '');
  const [consumerKey, setConsumerKey] = useState(saved?.consumerKey ?? '');
  const [consumerSecret, setConsumerSecret] = useState(saved?.consumerSecret ?? '');
  const [tokenId, setTokenId] = useState(saved?.tokenId ?? '');
  const [tokenSecret, setTokenSecret] = useState(saved?.tokenSecret ?? '');
  const [remember, setRemember] = useState(!!saved);
  const [showSecrets, setShowSecrets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = restletUrl && accountId && consumerKey && consumerSecret && tokenId && tokenSecret;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const creds: Credentials = {
      restletUrl, accountId, consumerKey, consumerSecret, tokenId, tokenSecret,
    };

    setLoading(true);
    setError(null);
    try {
      if (remember) saveCredentials(creds);
      await onLogin(creds);
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await onLogin({
      restletUrl: '', accountId: '', consumerKey: '',
      consumerSecret: '', tokenId: '', tokenSecret: '',
    });
  };

  return (
    <div className="login-overlay">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-header">
          <Shield size={32} />
          <div>
            <h1>Adaptive Governance Advisor</h1>
            <p>Conecte ao NetSuite via RESTlet (TBA)</p>
          </div>
        </div>

        {/* Endpoint */}
        <div className="login-section">
          <div className="login-section-title">Endpoint</div>
          <label className="login-label">URL do RESTlet</label>
          <input
            className="login-input"
            type="url"
            placeholder="https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1"
            value={restletUrl}
            onChange={e => setRestletUrl(e.target.value)}
          />
          <span className="login-hint">
            Setup &gt; Scripting &gt; Script Deployments &gt; copie a URL externa
          </span>
        </div>

        {/* Account */}
        <div className="login-section">
          <div className="login-section-title">Conta</div>
          <input
            className="login-input"
            placeholder="Account ID (ex: TSTDRV3052652)"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
          />
        </div>

        {/* Consumer */}
        <div className="login-section">
          <div className="login-section-title">
            Consumer (Integration Record)
            <button type="button" className="login-toggle" onClick={() => setShowSecrets(!showSecrets)}>
              {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
              {showSecrets ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <div className="login-grid">
            <div>
              <label className="login-label">Consumer Key</label>
              <input className="login-input" type={showSecrets ? 'text' : 'password'}
                placeholder="Consumer Key" value={consumerKey}
                onChange={e => setConsumerKey(e.target.value)} />
            </div>
            <div>
              <label className="login-label">Consumer Secret</label>
              <input className="login-input" type={showSecrets ? 'text' : 'password'}
                placeholder="Consumer Secret" value={consumerSecret}
                onChange={e => setConsumerSecret(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Token */}
        <div className="login-section">
          <div className="login-section-title">Token (Access Token)</div>
          <div className="login-grid">
            <div>
              <label className="login-label">Token ID</label>
              <input className="login-input" type={showSecrets ? 'text' : 'password'}
                placeholder="Token ID" value={tokenId}
                onChange={e => setTokenId(e.target.value)} />
            </div>
            <div>
              <label className="login-label">Token Secret</label>
              <input className="login-input" type={showSecrets ? 'text' : 'password'}
                placeholder="Token Secret" value={tokenSecret}
                onChange={e => setTokenSecret(e.target.value)} />
            </div>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        <label className="login-remember">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          Lembrar credenciais (localStorage)
        </label>

        <button className="login-submit" type="submit" disabled={!canSubmit || loading}>
          <LogIn size={16} />
          {loading ? 'Conectando...' : 'Conectar'}
        </button>

        <button className="login-skip" type="button" onClick={handleSkip}>
          Pular — usar dados de exemplo
        </button>
      </form>
    </div>
  );
}
