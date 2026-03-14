export interface Credentials {
  restletUrl: string;
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

const PROXY_BASE = 'http://localhost:3001';

export async function fetchSnapshot(creds: Credentials, action = 'snapshot'): Promise<any> {
  const url = action !== 'snapshot'
    ? `${creds.restletUrl}&action=${action}`
    : creds.restletUrl;

  const res = await fetch(`${PROXY_BASE}/api/netsuite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restletUrl: url,
      accountId: creds.accountId,
      consumerKey: creds.consumerKey,
      consumerSecret: creds.consumerSecret,
      tokenId: creds.tokenId,
      tokenSecret: creds.tokenSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Proxy ${res.status}: ${body}`);
  }

  return res.json();
}
