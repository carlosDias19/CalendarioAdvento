require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const { rateLimit } = require('express-rate-limit');
const { csrfSync } = require('csrf-sync');

const app = express();
const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(root, 'uploads'));
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
const secretPath = path.join(dataDir, 'session-secret');
const sessionSecret = process.env.SESSION_SECRET || (fs.existsSync(secretPath)
  ? fs.readFileSync(secretPath, 'utf8').trim()
  : crypto.randomBytes(48).toString('base64url'));
if (!process.env.SESSION_SECRET && !fs.existsSync(secretPath)) fs.writeFileSync(secretPath, sessionSecret, { mode: 0o600 });

const db = new Database(path.join(dataDir, 'advento.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS days (
    day INTEGER PRIMARY KEY CHECK(day BETWEEN 1 AND 25),
    type TEXT NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day INTEGER NOT NULL REFERENCES days(day) ON DELETE CASCADE,
    opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, day)
  );
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('login', 'open_day')),
    day INTEGER,
    occurred_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS activity_logs_occurred_at_idx ON activity_logs(occurred_at DESC);
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);
if (!db.prepare('SELECT 1 FROM activity_logs LIMIT 1').get()) {
  db.prepare(`
    INSERT INTO activity_logs (username, role, action, day, occurred_at)
    SELECT users.username, users.role, 'open_day', progress.day,
      strftime('%Y-%m-%dT%H:%M:%fZ', progress.opened_at)
    FROM progress
    JOIN users ON users.id = progress.user_id
  `).run();
}

class BetterSqliteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?').get(sid);
      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (error) { callback(error); }
  }

  set(sid, sessionData, callback) {
    try {
      const cookie = sessionData.cookie || {};
      const expires = cookie.expires ? new Date(cookie.expires).getTime() : Date.now() + (cookie.maxAge || 86400000);
      db.prepare('INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires')
        .run(sid, JSON.stringify(sessionData), expires);
      if (callback) callback(null);
    } catch (error) { if (callback) callback(error); }
  }

  destroy(sid, callback) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      if (callback) callback(null);
    } catch (error) { if (callback) callback(error); }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now()), 6 * 60 * 60 * 1000).unref();

const initialDays = [
  ['verse', 'Isaías 9:6', '', 'Porque um menino nos nasceu, um filho se nos deu, e o principado estará sobre os seus ombros, e se chamará o seu nome: Maravilhoso, Conselheiro, Deus Forte, Pai da Eternidade, Príncipe da Paz.'],
  ['challenge', '', 'Desafio', 'Hoje, escreva um bilhete à mão agradecendo a alguém da sua casa por algo específico que essa pessoa fez por você este ano e deixe em um lugar visível.'],
  ['video', '', '', ''],
  ['verse', 'Lucas 2:10-11', '', 'E o anjo lhes disse: Não temais, porque eis aqui vos trago novas de grande alegria, que será para todo o povo: Pois, na cidade de Davi, vos nasceu hoje o Salvador, que é Cristo, o Senhor.'],
  ['verse', 'Isaías 7:14', '', 'Portanto o mesmo Senhor vos dará um sinal: Eis que a virgem conceberá, e dará à luz um filho, e chamará o seu nome Emanuel.'],
  ['challenge', '', 'Desafio', 'Pense em alguém fora de casa que te ajudou, te apoiou ou marcou positivamente o seu ano. Hoje, mande uma mensagem ou fale pessoalmente agradecendo por isso.'],
  ['video', '', '', ''],
  ['music', '', '', ''],
  ['verse', 'Miqueias 5:2', '', 'E tu, Belém Efrata, posto que pequena entre os milhares de Judá, de ti me sairá o que governará em Israel, e cujas saídas são desde os tempos antigos, desde os dias da eternidade.'],
  ['challenge', '', 'Desafio', 'Pratique a generosidade de forma prática hoje: entregue uma cartinha de encorajamento, faça uma boa ação ou separe um item que você não usa mais para doação.'],
  ['video', '', '', ''],
  ['verse', 'Lucas 1:31-33', '', 'E eis que em teu ventre conceberás e darás à luz um filho, e chamarás o seu nome Jesus. Este será grande, e será chamado filho do Altíssimo; e o Senhor Deus lhe dará o trono de Davi, seu pai; E reinará eternamente na casa de Jacó, e o seu reino não terá fim.'],
  ['music', '', '', ''],
  ['challenge', '', 'Desafio', 'Hoje, passe 1 hora completa longe das telas do celular e use esse tempo para conversar de verdade com alguém ou dedicar um momento à oração.'],
  ['video', '', '', ''],
  ['verse', 'Isaías 11:1', '', 'Porque brotará um rebento do tronco de Jessé, e das suas raízes um renovo frutificará.'],
  ['music', '', '', ''],
  ['verse', 'Lucas 2:14', '', 'Glória a Deus nas alturas, paz na terra, boa vontade para com os homens.'],
  ['video', '', '', ''],
  ['verse', 'Mateus 1:21', '', 'E dará à luz um filho e chamarás o seu nome JESUS; porque ele salvará o seu povo dos seus pecados.'],
  ['music', '', '', ''],
  ['verse', 'João 1:14', '', 'E o Verbo se fez carne, e habitou entre nós, e vimos a sua glória, como a glória do unigênito do Pai, cheio de graça e de verdade.'],
  ['challenge', '', 'Desafio', 'Escolha uma pessoa do nosso grupo de jovens que você sabe que está passando por uma luta e ore por ela hoje. No fim do dia, mande uma mensagem dizendo que ela foi lembrada em oração.'],
  ['music', '', '', ''],
  ['verse', 'João 3:16', '', 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.']
];
const insertDay = db.prepare('INSERT OR IGNORE INTO days (day, type, reference, title, content) VALUES (?, ?, ?, ?, ?)');
initialDays.forEach((day, index) => insertDay.run(index + 1, ...day));

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
if (!db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()) {
  const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(adminUsername, bcrypt.hashSync(adminPassword, 12), 'admin');
  console.log(`Acesso inicial do administrador: usuário "${adminUsername}" e senha "${adminPassword}". Altere a senha no painel.`);
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new BetterSqliteSessionStore(),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));
const { generateToken, csrfSynchronisedProtection } = csrfSync({
  getTokenFromRequest: (req) => req.headers['x-csrf-token']
});
app.get('/api/csrf', (req, res) => res.json({ token: generateToken(req) }));
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return csrfSynchronisedProtection(req, res, next);
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.' }
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas contas foram criadas deste endereço. Tente novamente mais tarde.' }
});
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const validVideo = ext === '.mp4' && file.mimetype === 'video/mp4';
    const validAudio = ext === '.mp3' && ['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(file.mimetype);
    callback(validVideo || validAudio ? null : new Error('Envie um arquivo MP4 para vídeo ou MP3 para música.'), validVideo || validAudio);
  }
});

function saoPauloDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function currentAdventDay() {
  const [year, month, day] = saoPauloDate().split('-').map(Number);
  return month === 12 ? Math.min(day, 25) : 25;
}
function requireUser(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'user') return res.status(401).json({ error: 'Entre com sua conta para continuar.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(401).json({ error: 'Acesso exclusivo da administração.' });
  next();
}
function publicDay(day) {
  return { day: day.day, type: day.type, opened: Boolean(day.opened), available: day.day <= currentAdventDay() };
}
function getDay(number) {
  return db.prepare('SELECT * FROM days WHERE day = ?').get(number);
}
function cleanupMedia(url) {
  if (url && url.startsWith('/uploads/')) {
    const file = path.basename(url);
    try { fs.unlinkSync(path.join(uploadDir, file)); } catch {}
  }
}
function recordActivity(user, action, day = null) {
  db.prepare('INSERT INTO activity_logs (username, role, action, day, occurred_at) VALUES (?, ?, ?, ?, ?)')
    .run(user.username, user.role, action, day, new Date().toISOString());
}

app.get('/api/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session.user), user: req.session.user ? { username: req.session.user.username, role: req.session.user.role } : null, serverDate: saoPauloDate() });
});
app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND role = 'user'").get(String(username || '').trim());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) return res.status(401).json({ error: 'Não foi possível entrar. Confira seu usuário e sua senha.' });
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Não foi possível iniciar sua sessão.' });
    req.session.user = { id: user.id, username: user.username, role: user.role };
    recordActivity(req.session.user, 'login');
    res.json({ ok: true });
  });
});
app.post('/api/register', registrationLimiter, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username)) {
    return res.status(400).json({ error: 'Escolha um usuário de 3 a 32 caracteres, usando letras, números, ponto, hífen ou sublinhado.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Sua senha precisa ter pelo menos 8 caracteres.' });
  let userId;
  try {
    const result = db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')").run(username, bcrypt.hashSync(password, 12));
    userId = result.lastInsertRowid;
  } catch {
    return res.status(409).json({ error: 'Esse nome de usuário já está em uso. Escolha outro.' });
  }
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Sua conta foi criada, mas não foi possível iniciar a sessão. Entre com os dados para continuar.' });
    req.session.user = { id: userId, username, role: 'user' };
    recordActivity(req.session.user, 'login');
    res.status(201).json({ ok: true });
  });
});
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND role = 'admin'").get(String(username || '').trim());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) return res.status(401).json({ error: 'Acesso não reconhecido. Confira os dados e tente novamente.' });
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Não foi possível iniciar sua sessão.' });
    req.session.user = { id: user.id, username: user.username, role: user.role };
    recordActivity(req.session.user, 'login');
    res.json({ ok: true });
  });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/days', requireUser, (req, res) => {
  const opened = new Set(db.prepare('SELECT day FROM progress WHERE user_id = ?').all(req.session.user.id).map((row) => row.day));
  res.json(db.prepare('SELECT day, type FROM days ORDER BY day').all().map((day) => publicDay({ ...day, opened: opened.has(day.day) })));
});
app.post('/api/days/:number/open', requireUser, (req, res) => {
  const number = Number(req.params.number);
  const day = getDay(number);
  if (!day) return res.status(404).json({ error: 'Este dia não foi encontrado.' });
  if (number > currentAdventDay()) return res.status(403).json({ error: `Calma! Este presente só abre no dia ${number} de dezembro.` });
  db.prepare('INSERT OR IGNORE INTO progress (user_id, day) VALUES (?, ?)').run(req.session.user.id, number);
  recordActivity(req.session.user, 'open_day', number);
  res.json(day);
});
app.get('/api/days/:number/qr', requireUser, async (req, res) => {
  const number = Number(req.params.number);
  const day = getDay(number);
  const opened = db.prepare('SELECT 1 FROM progress WHERE user_id = ? AND day = ?').get(req.session.user.id, number);
  if (!day || !opened || day.type !== 'music' || !day.media_url) return res.status(404).json({ error: 'QR Code indisponível.' });
  const qrTarget = day.media_url.startsWith('/uploads/') ? `${process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`}${day.media_url}` : day.media_url;
  try { res.json({ dataUrl: await QRCode.toDataURL(qrTarget, { width: 220, margin: 1, color: { dark: '#10241e', light: '#ffffff' } }) }); }
  catch { res.status(500).json({ error: 'Não foi possível gerar o QR Code.' }); }
});

app.get('/api/admin/days', requireAdmin, (_req, res) => res.json(db.prepare('SELECT * FROM days ORDER BY day').all()));
app.put('/api/admin/days/:number', requireAdmin, (req, res) => {
  const number = Number(req.params.number);
  const { type, reference = '', title = '', content = '', media_url = '' } = req.body || {};
  if (!getDay(number)) return res.status(404).json({ error: 'Dia não encontrado.' });
  if (!['verse', 'challenge', 'video', 'music'].includes(type)) return res.status(400).json({ error: 'Escolha um tipo de conteúdo válido.' });
  const mediaUrl = String(media_url).trim();
  const validRemoteUrl = /^https:\/\//i.test(mediaUrl);
  const validUploadedFile = /^\/uploads\/[\w-]+\.(mp4|mp3)$/i.test(mediaUrl);
  if (mediaUrl && !validRemoteUrl && !validUploadedFile) return res.status(400).json({ error: 'Use um link HTTPS válido ou envie um arquivo de mídia.' });
  db.prepare('UPDATE days SET type = ?, reference = ?, title = ?, content = ?, media_url = ?, updated_at = CURRENT_TIMESTAMP WHERE day = ?').run(type, String(reference).slice(0, 160), String(title).slice(0, 160), String(content).slice(0, 10000), mediaUrl.slice(0, 1000), number);
  res.json(getDay(number));
});
app.post('/api/admin/days/:number/media', requireAdmin, upload.single('media'), (req, res) => {
  const number = Number(req.params.number);
  const day = getDay(number);
  if (!day) { if (req.file) fs.unlinkSync(req.file.path); return res.status(404).json({ error: 'Dia não encontrado.' }); }
  if (!req.file) return res.status(400).json({ error: 'Escolha um arquivo para enviar.' });
  const extension = path.extname(req.file.originalname).toLowerCase();
  if ((day.type === 'video' && extension !== '.mp4') || (day.type === 'music' && extension !== '.mp3') || (day.type !== 'video' && day.type !== 'music')) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'O formato do arquivo não corresponde ao tipo de conteúdo deste dia.' });
  }
  if (extension === '.mp3' && req.file.size > 30 * 1024 * 1024) {
    fs.unlinkSync(req.file.path);
    return res.status(413).json({ error: 'O arquivo de música ultrapassa o limite de 30 MB.' });
  }
  cleanupMedia(day.media_url);
  const mediaUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE days SET media_url = ?, updated_at = CURRENT_TIMESTAMP WHERE day = ?').run(mediaUrl, number);
  res.json({ media_url: mediaUrl });
});
app.delete('/api/admin/days/:number/media', requireAdmin, (req, res) => {
  const number = Number(req.params.number);
  const day = getDay(number);
  if (!day) return res.status(404).json({ error: 'Dia não encontrado.' });
  cleanupMedia(day.media_url);
  db.prepare("UPDATE days SET media_url = '', updated_at = CURRENT_TIMESTAMP WHERE day = ?").run(number);
  res.json({ ok: true });
});
app.get('/api/admin/users', requireAdmin, (_req, res) => res.json(db.prepare("SELECT id, username, created_at FROM users WHERE role = 'user' ORDER BY username").all()));
app.get('/api/admin/activity', requireAdmin, (req, res) => {
  const action = ['login', 'open_day'].includes(req.query.type) ? req.query.type : null;
  const query = action
    ? 'SELECT username, role, action, day, occurred_at FROM activity_logs WHERE action = ? ORDER BY id DESC LIMIT 300'
    : 'SELECT username, role, action, day, occurred_at FROM activity_logs ORDER BY id DESC LIMIT 300';
  res.json(action ? db.prepare(query).all(action) : db.prepare(query).all());
});
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username) || password.length < 8) return res.status(400).json({ error: 'Use um usuário de 3 a 32 caracteres e uma senha com pelo menos 8 caracteres.' });
  try {
    const result = db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')").run(username, bcrypt.hashSync(password, 12));
    res.status(201).json({ id: result.lastInsertRowid, username });
  } catch { res.status(409).json({ error: 'Já existe uma conta com esse usuário.' }); }
});
app.patch('/api/admin/users/:id/password', requireAdmin, (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  const result = db.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND role = 'user'").run(bcrypt.hashSync(password, 12), Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Conta não encontrada.' });
  res.json({ ok: true });
});
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'user'").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Conta não encontrada.' });
  res.json({ ok: true });
});
app.post('/api/admin/test-mode', requireAdmin, (req, res) => {
  req.session.testMode = Boolean(req.body?.enabled);
  req.session.testDay = Math.max(1, Math.min(25, Number(req.body?.day) || 1));
  res.json({ enabled: req.session.testMode, day: req.session.testDay });
});
app.get('/api/admin/test-mode', requireAdmin, (req, res) => {
  res.json({ enabled: Boolean(req.session.testMode), day: req.session.testDay || 1 });
});
app.get('/api/admin/preview/:number', requireAdmin, (req, res) => {
  const number = Number(req.params.number);
  if (!req.session.testMode) return res.status(403).json({ error: 'Ative o modo de teste para pré-visualizar um dia.' });
  const day = getDay(number);
  if (!day) return res.status(404).json({ error: 'Dia não encontrado.' });
  res.json({ ...day, testMode: Boolean(req.session.testMode), previewDay: req.session.testDay });
});
app.patch('/api/admin/password', requireAdmin, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const admin = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'admin'").get(req.session.user.id);
  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) return res.status(401).json({ error: 'A senha atual não confere.' });
  if (newPassword.length < 10) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 10 caracteres.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 12), admin.id);
  res.json({ ok: true });
});

app.use('/uploads', express.static(uploadDir, { fallthrough: false, maxAge: '1h' }));
app.get('/admin.html', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(404).send('Página não encontrada.');
  res.redirect('/painel-natal-admin');
});
app.get('/criar-conta', (_req, res) => res.sendFile(path.join(root, 'public', 'signup.html')));
app.use(express.static(path.join(root, 'public')));
app.get('/painel-natal-admin', (req, res) => {
  if (req.session.user && req.session.user.role !== 'admin') return res.status(404).send('Página não encontrada.');
  res.sendFile(path.join(root, 'public', 'admin.html'));
});
app.use((error, _req, res, _next) => {
  const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 'O arquivo ultrapassa o limite permitido.' : (error.message || 'Ocorreu um erro inesperado.');
  res.status(error.status || 400).json({ error: message });
});

app.listen(port, () => console.log(`Calendário Advento disponível em http://localhost:${port}`));
