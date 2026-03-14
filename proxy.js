import express from 'express';
import crypto from 'crypto';
import cors from 'cors';

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// ── Serve dashboard static files ─────────────────────────────────
import fs from 'fs';
const distPath = path.join(__dirname, 'dashboard', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  console.log('📁 Serving dashboard from', distPath);
} else {
  console.warn('⚠️  dashboard/dist not found — run "npm run build" first');
}

// ── OAuth 1.0 signing ─────────────────────────────────────────────
function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function buildOAuthHeader({ method, url, consumerKey, consumerSecret, tokenId, tokenSecret, accountId }) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Parse the URL to separate base and query params
  const urlObj = new URL(url);
  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

  // Collect all params (query + oauth)
  const params = {};
  urlObj.searchParams.forEach((v, k) => { params[k] = v; });

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_token: tokenId,
    oauth_version: '1.0',
  };

  Object.assign(params, oauthParams);

  // Sort and build param string
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');

  // Signature base string
  const signatureBase = [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join('&');

  // Signing key
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  // HMAC-SHA256
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(signatureBase)
    .digest('base64');

  // Build Authorization header
  const realm = accountId.toUpperCase().replace(/-/g, '_');
  const authParts = [
    `realm="${realm}"`,
    `oauth_consumer_key="${percentEncode(consumerKey)}"`,
    `oauth_token="${percentEncode(tokenId)}"`,
    `oauth_nonce="${percentEncode(nonce)}"`,
    `oauth_timestamp="${timestamp}"`,
    `oauth_signature_method="HMAC-SHA256"`,
    `oauth_version="1.0"`,
    `oauth_signature="${percentEncode(signature)}"`,
  ];

  return `OAuth ${authParts.join(', ')}`;
}

// ── Proxy endpoint ────────────────────────────────────────────────
app.post('/api/netsuite', async (req, res) => {
  const { restletUrl, accountId, consumerKey, consumerSecret, tokenId, tokenSecret } = req.body;

  if (!restletUrl || !accountId || !consumerKey || !consumerSecret || !tokenId || !tokenSecret) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try {
    const authHeader = buildOAuthHeader({
      method: 'GET',
      url: restletUrl,
      consumerKey,
      consumerSecret,
      tokenId,
      tokenSecret,
      accountId,
    });

    const response = await fetch(restletUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    const text = await response.text();

    if (!response.ok) {
      console.error(`NetSuite ${response.status}:`, text);
      return res.status(response.status).send(text);
    }

    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── SPA fallback — serve index.html for all non-API routes ───────
app.get('*', (_req, res) => {
  const indexPath = path.join(__dirname, 'dashboard', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).send('Dashboard not built. Run: npm run build');
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🛡️  Governance Advisor rodando em 0.0.0.0:${PORT}`);
});
