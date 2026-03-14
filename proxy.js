import express from 'express';
import crypto from 'crypto';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🛡️  Governance Proxy rodando em http://localhost:${PORT}`);
  console.log(`   Dashboard pode chamar POST /api/netsuite`);
});
