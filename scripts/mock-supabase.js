// Minimal Supabase stand-in for exercising signed-in UI in a headless browser.
// Implements just enough of GoTrue + PostgREST for the app to boot with a
// session. Returns an empty dataset, so nothing here can touch real data.
const http = require('http');

const PORT = Number(process.argv[2] || 54321);
const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@example.com',
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Test User' },
  identities: []
};

const PROFILE = {
  id: USER.id, name: 'Test User', role: 'UI/UX Designer', location: 'Jakarta',
  bio: 'Local test profile', avatar_url: '', email: 'test@example.com',
  created_at: USER.created_at, is_admin: false, handle: 'testuser',
  handle_changed_at: null, links: [], updated_at: USER.updated_at,
  onboarding_completed: process.env.MOCK_ONBOARDING ? false : true, last_active_at: null, last_platform: null,
  last_app_version: null, is_banned: false, suspended_until: null,
  has_password_auth: true, contacts: [], contact_consent: false,
  last_password_reminder_sent_at: null
};

function send(res, code, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range',
    ...headers
  });
  res.end(data);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname;
  const wantsSingle = String(req.headers.accept || '').includes('vnd.pgrst.object');

  if (path === '/auth/v1/token') {
    return send(res, 200, {
      access_token: 'mock-access-token', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'mock-refresh-token', user: USER
    });
  }
  if (path === '/auth/v1/user') return send(res, 200, USER); // handles GET and PUT (updateUser)
  if (path === '/auth/v1/logout') return send(res, 204);
  if (path === '/auth/v1/settings') return send(res, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true });

  if (path.startsWith('/rest/v1/')) {
    const table = path.slice('/rest/v1/'.length);
    if (table === 'profiles') {
      const body = wantsSingle ? PROFILE : [PROFILE];
      return send(res, 200, body, { 'Content-Range': '0-0/1' });
    }
    // every other table: empty for reads, echo for writes
    if (req.method === 'GET') return send(res, 200, wantsSingle ? null : [], { 'Content-Range': '0-0/0' });
    return send(res, 201, wantsSingle ? {} : [{}]);
  }

  if (path.startsWith('/storage/v1/')) return send(res, 200, { Key: 'mock' });
  send(res, 404, { message: 'not mocked: ' + path });
});

server.on('upgrade', (req, socket) => socket.destroy());
server.listen(PORT, '127.0.0.1', () => console.log('mock supabase on http://127.0.0.1:' + PORT));
