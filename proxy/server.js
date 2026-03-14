import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ── OAuth 1.0 TBA signing ──────────────────────────────────────────────

function generateOAuthHeader(method, url, creds) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');

  const params = {
    oauth_consumer_key: creds.consumerKey,
    oauth_token: creds.tokenId,
    oauth_nonce: nonce,
    oauth_timestamp: timestamp,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_version: '1.0',
  };

  const paramString = Object.keys(params)
    .sort()
    .map(k => `${encodeRFC3986(k)}=${encodeRFC3986(params[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encodeRFC3986(url.split('?')[0]),
    encodeRFC3986(paramString),
  ].join('&');

  const signingKey = `${encodeRFC3986(creds.consumerSecret)}&${encodeRFC3986(creds.tokenSecret)}`;
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(baseString)
    .digest('base64');

  // Extract account ID from URL (e.g., td3052652 from td3052652.restlets.api...)
  const accountMatch = url.match(/^https?:\/\/([^.]+)\./);
  const realm = accountMatch ? accountMatch[1].toUpperCase().replace(/-/g, '_') : '';

  return (
    `OAuth realm="${realm}", ` +
    `oauth_consumer_key="${creds.consumerKey}", ` +
    `oauth_token="${creds.tokenId}", ` +
    `oauth_nonce="${nonce}", ` +
    `oauth_timestamp="${timestamp}", ` +
    `oauth_signature_method="HMAC-SHA256", ` +
    `oauth_version="1.0", ` +
    `oauth_signature="${encodeRFC3986(signature)}"`
  );
}

function encodeRFC3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

// ── Proxy endpoint (credentials come from frontend via POST body) ──────

app.post('/api/snapshot', async (req, res) => {
  try {
    const { restletUrl, consumerKey, consumerSecret, tokenId, tokenSecret, action } = req.body;

    if (!restletUrl || !consumerKey || !tokenId) {
      return res.status(400).json({ error: 'Credenciais incompletas' });
    }

    // Append action param to URL
    const separator = restletUrl.includes('?') ? '&' : '?';
    const url = `${restletUrl}${separator}action=${action || 'snapshot'}`;

    const authHeader = generateOAuthHeader('GET', url, {
      consumerKey, consumerSecret, tokenId, tokenSecret,
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: `NetSuite ${response.status}: ${text.substring(0, 500)}`,
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Proxy rodando em http://localhost:${PORT}`);
});
