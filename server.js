const http = require('http');
const fs = require('fs');
const path = require('path');
const auth = require('./lib/auth');
const projects = require('./lib/projects');
const store = require('./lib/store');

const PORT = 2003;
const STATIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

// --- Helpers ---

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach(pair => {
    const [k, ...v] = pair.trim().split('=');
    if (k) cookies[k] = v.join('=');
  });
  return cookies;
}

function setCookie(res, name, value, maxAge) {
  const parts = [name + '=' + value, 'HttpOnly', 'Path=/', 'SameSite=Lax'];
  if (maxAge !== undefined) parts.push('Max-Age=' + maxAge);
  // Append to existing Set-Cookie headers
  const existing = res.getHeader('Set-Cookie') || [];
  const arr = Array.isArray(existing) ? existing : (existing ? [existing] : []);
  arr.push(parts.join('; '));
  res.setHeader('Set-Cookie', arr);
}

function clearCookie(res, name) {
  setCookie(res, name, '', 0);
}

function requireAuth(req) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  if (!token) return null;
  const session = auth.getSession(token);
  if (!session) return null;
  const user = auth.getUserById(session.userId);
  if (!user) return null;
  return { token, user };
}

function parseURL(url) {
  const qIndex = url.indexOf('?');
  return qIndex >= 0 ? url.substring(0, qIndex) : url;
}

// --- Initialize data directory ---
store.ensureDir('projects');

// --- Server ---

const server = http.createServer(async (req, res) => {
  const urlPath = parseURL(req.url);

  try {
    // ========== API Routes ==========

    // POST /api/register
    if (req.method === 'POST' && urlPath === '/api/register') {
      const body = JSON.parse(await readBody(req));
      const result = auth.register(body.username, body.email, body.password);
      if (result.error) return sendJSON(res, 400, { error: result.error });
      // Auto-login after register
      const loginResult = auth.login(body.email, body.password);
      if (loginResult.error) return sendJSON(res, 500, { error: 'Registration succeeded but login failed' });
      setCookie(res, 'session', loginResult.token, 604800);
      return sendJSON(res, 200, { user: loginResult.user });
    }

    // POST /api/login
    if (req.method === 'POST' && urlPath === '/api/login') {
      const body = JSON.parse(await readBody(req));
      const result = auth.login(body.email, body.password);
      if (result.error) return sendJSON(res, 401, { error: result.error });
      setCookie(res, 'session', result.token, 604800);
      return sendJSON(res, 200, { user: result.user });
    }

    // POST /api/logout
    if (req.method === 'POST' && urlPath === '/api/logout') {
      const cookies = parseCookies(req);
      if (cookies.session) auth.logout(cookies.session);
      clearCookie(res, 'session');
      return sendJSON(res, 200, { ok: true });
    }

    // GET /api/me
    if (req.method === 'GET' && urlPath === '/api/me') {
      const ctx = requireAuth(req);
      if (!ctx) return sendJSON(res, 401, { error: 'Not authenticated' });
      return sendJSON(res, 200, { user: ctx.user });
    }

    // GET /api/projects
    if (req.method === 'GET' && urlPath === '/api/projects') {
      const ctx = requireAuth(req);
      if (!ctx) return sendJSON(res, 401, { error: 'Not authenticated' });
      const list = projects.listByOwner(ctx.user.id);
      return sendJSON(res, 200, { projects: list });
    }

    // POST /api/projects
    if (req.method === 'POST' && urlPath === '/api/projects') {
      const ctx = requireAuth(req);
      if (!ctx) return sendJSON(res, 401, { error: 'Not authenticated' });
      const body = JSON.parse(await readBody(req));
      const project = projects.create(ctx.user.id, body.title);
      return sendJSON(res, 200, { project });
    }

    // Project-scoped routes
    const projectMatch = urlPath.match(/^\/api\/projects\/([a-f0-9-]+)(\/scene|\/backups|\/backups\/(\d+)\/revert)?$/);
    if (projectMatch) {
      const uid = projectMatch[1];
      const subRoute = projectMatch[2] || '';

      const ctx = requireAuth(req);
      if (!ctx) return sendJSON(res, 401, { error: 'Not authenticated' });

      const project = projects.get(uid);
      if (!project) return sendJSON(res, 404, { error: 'Project not found' });
      if (project.ownerId !== ctx.user.id) return sendJSON(res, 403, { error: 'Access denied' });

      if (subRoute === '/scene') {
        // GET /api/projects/:uid/scene
        if (req.method === 'GET') {
          const scene = projects.getScene(uid);
          if (!scene) return sendJSON(res, 404, { error: 'Scene not found' });
          return sendJSON(res, 200, scene);
        }
        // PUT /api/projects/:uid/scene
        if (req.method === 'PUT') {
          const body = JSON.parse(await readBody(req));
          projects.saveScene(uid, body);
          return sendJSON(res, 200, { ok: true });
        }
      } else if (subRoute === '/backups') {
        // GET /api/projects/:uid/backups
        if (req.method === 'GET') {
          const backups = projects.getBackups(uid);
          return sendJSON(res, 200, { backups: backups.map((b, i) => ({ index: i, timestamp: b.timestamp })) });
        }
      } else if (subRoute && subRoute.startsWith('/backups/') && subRoute.endsWith('/revert')) {
        // POST /api/projects/:uid/backups/:index/revert
        if (req.method === 'POST') {
          const index = parseInt(projectMatch[3], 10);
          const scene = projects.revertToBackup(uid, index);
          if (!scene) return sendJSON(res, 404, { error: 'Backup not found' });
          return sendJSON(res, 200, scene);
        }
      } else {
        // DELETE /api/projects/:uid
        if (req.method === 'DELETE') {
          projects.remove(uid);
          return sendJSON(res, 200, { ok: true });
        }
      }
    }

    // POST /api/upload-model — upload .glb/.gltf model files
    if (req.method === 'POST' && urlPath === '/api/upload-model') {
      const ctx = requireAuth(req);
      if (!ctx) return sendJSON(res, 401, { error: 'Not authenticated' });

      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const buffer = Buffer.concat(chunks);

        // Size limit: 20 MB
        if (buffer.length > 20 * 1024 * 1024) {
          return sendJSON(res, 413, { error: 'File too large (max 20 MB)' });
        }

        // Sanitize filename from header
        const rawName = req.headers['x-filename'] || 'model.glb';
        const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const ext = path.extname(safeName).toLowerCase();
        if (ext !== '.glb' && ext !== '.gltf') {
          return sendJSON(res, 400, { error: 'Only .glb and .gltf files allowed' });
        }

        // GLB magic number validation
        if (ext === '.glb' && buffer.length >= 4) {
          const magic = buffer.readUInt32LE(0);
          if (magic !== 0x46546C67) { // 'glTF'
            return sendJSON(res, 400, { error: 'Invalid GLB file' });
          }
        }

        // Write to models/uploads/
        const uploadDir = path.join(STATIC_DIR, 'models', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        // Deduplicate: add timestamp if exists
        let finalName = safeName;
        if (fs.existsSync(path.join(uploadDir, finalName))) {
          finalName = Date.now() + '-' + finalName;
        }

        fs.writeFileSync(path.join(uploadDir, finalName), buffer);
        const url = 'models/uploads/' + finalName;
        return sendJSON(res, 200, { url: url, name: finalName });
      });
      return;
    }

    // Legacy: POST /save-scene (backward compat)
    if (req.method === 'POST' && urlPath === '/save-scene') {
      const body = await readBody(req);
      try {
        JSON.parse(body);
        const scenePath = path.join(STATIC_DIR, 'scene.json');
        fs.writeFileSync(scenePath, body, 'utf8');
        return sendJSON(res, 200, { ok: true });
      } catch (e) {
        return sendJSON(res, 400, { error: 'Invalid JSON' });
      }
    }

    // ========== Page Routes ==========

    // Root redirect
    if (urlPath === '/') {
      const ctx = requireAuth(req);
      const target = ctx ? '/dashboard' : '/login';
      res.writeHead(302, { Location: target });
      return res.end();
    }

    // Login page
    if (urlPath === '/login') {
      const ctx = requireAuth(req);
      if (ctx) {
        res.writeHead(302, { Location: '/dashboard' });
        return res.end();
      }
      return serveFile(res, path.join(STATIC_DIR, 'login.html'));
    }

    // Dashboard page
    if (urlPath === '/dashboard') {
      const ctx = requireAuth(req);
      if (!ctx) {
        res.writeHead(302, { Location: '/login' });
        return res.end();
      }
      return serveFile(res, path.join(STATIC_DIR, 'dashboard.html'));
    }

    // Project editor: /projects/:uid
    const editorMatch = urlPath.match(/^\/projects\/([a-f0-9-]+)$/);
    if (editorMatch) {
      const ctx = requireAuth(req);
      if (!ctx) {
        res.writeHead(302, { Location: '/login' });
        return res.end();
      }
      const uid = editorMatch[1];
      const project = projects.get(uid);
      if (!project || project.ownerId !== ctx.user.id) {
        res.writeHead(302, { Location: '/dashboard' });
        return res.end();
      }
      return serveFile(res, path.join(STATIC_DIR, 'editor.html'));
    }

    // ========== Static Files ==========

    // Block data/ directory from static serving
    if (urlPath.startsWith('/data/') || urlPath === '/data') {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    // Block lib/ directory from static serving
    if (urlPath.startsWith('/lib/') || urlPath === '/lib') {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    let filePath = path.join(STATIC_DIR, urlPath);

    // Prevent directory traversal
    if (!filePath.startsWith(STATIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    return serveFile(res, filePath);

  } catch (e) {
    console.error('Server error:', e);
    sendJSON(res, 500, { error: 'Internal server error' });
  }
});

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Pegasus Studio running at http://0.0.0.0:${PORT}`);
});
