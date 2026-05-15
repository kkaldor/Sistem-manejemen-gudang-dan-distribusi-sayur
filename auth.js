// auth.js - offline akun & login (localStorage)

(function () {
  const AUTH_USERS_KEY = 'warehouse_users_v1';
  const AUTH_SESSION_KEY = 'warehouse_session_v1';

  function safeJSONParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  // WARNING: ini demo/offline. Bukan kriptografi keamanan sungguhan.
  // Untuk kebutuhan tugas/kelas, cukup untuk gating login.
  function hashPasswordSimple(password) {
    const str = String(password);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `fnv1a_${(h >>> 0).toString(16)}`;
  }

  function loadUsers() {
    const raw = localStorage.getItem(AUTH_USERS_KEY);
    const parsed = safeJSONParse(raw, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function saveUsers(users) {
    localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
  }

  function loadSession() {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    return safeJSONParse(raw, null);
  }

  function saveSession(session) {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(AUTH_SESSION_KEY);
  }

  function isLoggedIn() {
    const s = loadSession();
    return !!(s && s.userId && s.username);
  }

  function getCurrentUser() {
    return loadSession();
  }

  function uid(prefix = 'usr') {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  function normalizeUsername(u) {
    return String(u || '').trim().toLowerCase();
  }

  function validateRegister(username, password) {
    const u = normalizeUsername(username);
    const p = String(password || '');
    if (!u) return 'Username wajib diisi.';
    if (u.length < 3) return 'Username minimal 3 karakter.';
    if (!p) return 'Password wajib diisi.';
    if (p.length < 6) return 'Password minimal 6 karakter.';
    return null;
  }

  function register(username, password) {
    const err = validateRegister(username, password);
    if (err) return { ok: false, error: err };

    const u = normalizeUsername(username);
    const users = loadUsers();

    if (users.some((x) => normalizeUsername(x.username) === u)) {
      return { ok: false, error: 'Username sudah terdaftar.' };
    }

    const user = {
      id: uid('user'),
      username: u,
      passwordHash: hashPasswordSimple(password),
      createdAt: new Date().toISOString()
    };

    users.push(user);
    saveUsers(users);

    // Auto login setelah register
    saveSession({ userId: user.id, username: user.username, createdAt: new Date().toISOString() });
    return { ok: true, user: { id: user.id, username: user.username } };
  }

  function login(username, password) {
    const u = normalizeUsername(username);
    const pHash = hashPasswordSimple(password);
    const users = loadUsers();

    const user = users.find((x) => normalizeUsername(x.username) === u);
    if (!user) return { ok: false, error: 'Username tidak ditemukan.' };
    if (user.passwordHash !== pHash) return { ok: false, error: 'Password salah.' };

    saveSession({ userId: user.id, username: user.username, createdAt: new Date().toISOString() });
    return { ok: true, user: { id: user.id, username: user.username } };
  }

  function logout() {
    clearSession();
  }

  function requireLoginOrRedirect(options = {}) {
    const {
      loginPath = './login.html',
      preserve = true
    } = options;

    if (isLoggedIn()) return true;

    try {
      if (preserve) {
        const url = new URL(window.location.href);
        url.searchParams.set('next', url.pathname + url.search + url.hash);
        window.location.href = loginPath + '?' + url.searchParams.toString();
      } else {
        window.location.href = loginPath;
      }
    } catch {
      window.location.href = loginPath;
    }

    return false;
  }

  window.WarehouseAuth = {
    isLoggedIn,
    getCurrentUser,
    register,
    login,
    logout,
    requireLoginOrRedirect
  };
})();

