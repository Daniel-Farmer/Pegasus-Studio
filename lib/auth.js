// ============================================================
// AUTH — User registration, login, sessions (crypto.scryptSync)
// ============================================================

const crypto = require('crypto');
const store = require('./store');

const USERS_FILE = 'users.json';
const SESSIONS_FILE = 'sessions.json';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// --- Helpers ---

function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function cleanExpiredSessions(sessions) {
  const now = Date.now();
  const cleaned = {};
  for (const token in sessions) {
    if (sessions[token].expiresAt > now) {
      cleaned[token] = sessions[token];
    }
  }
  return cleaned;
}

// --- Public API ---

function register(username, email, password) {
  // Validate
  if (!username || username.trim().length < 2) {
    return { error: 'Username must be at least 2 characters' };
  }
  if (!email || !email.includes('@')) {
    return { error: 'Invalid email address' };
  }
  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  username = username.trim();
  email = email.trim().toLowerCase();

  const users = store.readJSON(USERS_FILE) || [];

  // Check duplicates
  for (const u of users) {
    if (u.email === email) return { error: 'Email already registered' };
    if (u.username.toLowerCase() === username.toLowerCase()) return { error: 'Username already taken' };
  }

  const { hash, salt } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    username,
    email,
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  store.writeJSON(USERS_FILE, users);

  return { user: { id: user.id, username: user.username, email: user.email } };
}

function login(email, password) {
  if (!email || !password) return { error: 'Email and password required' };

  email = email.trim().toLowerCase();
  const users = store.readJSON(USERS_FILE) || [];
  const user = users.find(u => u.email === email);
  if (!user) return { error: 'Invalid email or password' };

  const { hash } = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return { error: 'Invalid email or password' };

  // Create session
  const token = generateToken();
  const sessions = cleanExpiredSessions(store.readJSON(SESSIONS_FILE) || {});
  sessions[token] = {
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL
  };
  store.writeJSON(SESSIONS_FILE, sessions);

  return {
    token,
    user: { id: user.id, username: user.username, email: user.email }
  };
}

function logout(token) {
  if (!token) return;
  const sessions = store.readJSON(SESSIONS_FILE) || {};
  delete sessions[token];
  store.writeJSON(SESSIONS_FILE, sessions);
}

function getSession(token) {
  if (!token) return null;
  const sessions = store.readJSON(SESSIONS_FILE) || {};
  const session = sessions[token];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    delete sessions[token];
    store.writeJSON(SESSIONS_FILE, sessions);
    return null;
  }
  return session;
}

function getUserById(id) {
  const users = store.readJSON(USERS_FILE) || [];
  const user = users.find(u => u.id === id);
  if (!user) return null;
  return { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt };
}

module.exports = { register, login, logout, getSession, getUserById };
