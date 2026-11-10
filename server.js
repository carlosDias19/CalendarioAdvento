require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const connectPgSimple = require('connect-pg-simple');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const { rateLimit } = require('express-rate-limit');
const { csrfSync } = require('csrf-sync');

const app = express();
const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const sessionSecret = process.env.SESSION_SECRET;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'calendario-advento';
const videoLimit = 50 * 1024 * 1024;
const missingEnvironment = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSION_SECRET']
  .filter((name) => !process.env[name]);
if (missingEnvironment.length) throw new Error(`Configure as variáveis: ${missingEnvironment.join(', ')}.`);
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  throw new Error('Configure ADMIN_PASSWORD para criar o primeiro acesso administrativo.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const PgSessionStore = connectPgSimple(session);

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

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
async function initializeDatabase() {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS app_private;
    REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
    CREATE TABLE IF NOT EXISTS app_private.users (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS app_private.days (
      day INTEGER PRIMARY KEY CHECK(day BETWEEN 1 AND 25),
      type TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      media_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS app_private.progress (
      user_id BIGINT NOT NULL REFERENCES app_private.users(id) ON DELETE CASCADE,
      day INTEGER NOT NULL REFERENCES app_private.days(day) ON DELETE CASCADE,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, day)
    );
    CREATE TABLE IF NOT EXISTS app_private.activity_logs (
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('login', 'open_day')),
      day INTEGER,
      occurred_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_logs_occurred_at_idx ON app_private.activity_logs(occurred_at DESC);
    CREATE TABLE IF NOT EXISTS app_private.sessions (
      sid varchar NOT NULL PRIMARY KEY,
      sess json NOT NULL,
      expire timestamp(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expire_idx ON app_private.sessions(expire);
  `);

  for (const [index, day] of initialDays.entries()) {
    await pool.query(
      'INSERT INTO app_private.days (day, type, reference, title, content) VALUES ($1, $2, $3, $4, $5) ON CONFLICT(day) DO NOTHING',
      [index + 1, ...day]
    );
  }

  await pool.query(`
    INSERT INTO app_private.activity_logs (username, role, action, day, occurred_at)
    SELECT users.username, users.role, 'open_day', progress.day, progress.opened_at
    FROM app_private.progress AS progress
    JOIN app_private.users AS users ON users.id = progress.user_id
    WHERE NOT EXISTS (SELECT 1 FROM app_private.activity_logs)
  `);

  const { rows } = await pool.query("SELECT id FROM app_private.users WHERE role = 'admin' LIMIT 1");
  if (!rows.length) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
    await pool.query(
      'INSERT INTO app_private.users (username, password_hash, role) VALUES ($1, $2, $3)',
      [adminUsername, bcrypt.hashSync(adminPassword, 12), 'admin']
    );
    if (process.env.ADMIN_PASSWORD) {
      console.log(`Acesso inicial do administrador criado para "${adminUsername}" usando ADMIN_PASSWORD.`);
    } else {
      console.log(`Acesso inicial do administrador: usuário "${adminUsername}" e senha "${adminPassword}". Altere a senha no painel.`);
    }
  }
}

async function initializeStorage() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`Não foi possível acessar o Supabase Storage: ${listError.message}`);
  const bucket = buckets.find((item) => item.name === storageBucket);
  const options = { public: true, fileSizeLimit: videoLimit, allowedMimeTypes: ['video/mp4', 'audio/mpeg'] };
  const result = bucket
    ? await supabase.storage.updateBucket(storageBucket, options)
    : await supabase.storage.createBucket(storageBucket, options);
  if (result.error) throw new Error(`Não foi possível configurar o bucket ${storageBucket}: ${result.error.message}`);
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new PgSessionStore({ pool, schemaName: 'app_private', tableName: 'sessions', createTableIfMissing: false }),
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
  storage: multer.memoryStorage(),
  limits: { fileSize: videoLimit, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const validVideo = ext === '.mp4' && file.mimetype === 'video/mp4';
    const validAudio = ext === '.mp3' && ['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(file.mimetype);
    if (validVideo || validAudio) return callback(null, true);
    const error = new Error('Envie um arquivo MP4 para vídeo ou MP3 para música.');
    error.status = 400;
    callback(error, false);
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
async function getDay(number) {
  const { rows } = await pool.query('SELECT * FROM app_private.days WHERE day = $1', [number]);
  return rows[0];
}
async function cleanupMedia(mediaUrl) {
  if (!mediaUrl) return;
  let parsedUrl;
  try { parsedUrl = new URL(mediaUrl); } catch { return; }
  const prefix = `/storage/v1/object/public/${storageBucket}/`;
  if (parsedUrl.origin !== new URL(supabaseUrl).origin || !parsedUrl.pathname.startsWith(prefix)) return;
  const objectPath = decodeURIComponent(parsedUrl.pathname.slice(prefix.length));
  if (!objectPath) return;
  const { error } = await supabase.storage.from(storageBucket).remove([objectPath]);
  if (error) throw new Error(`Não foi possível remover a mídia anterior: ${error.message}`);
}
async function recordActivity(user, action, day = null) {
  await pool.query(
    'INSERT INTO app_private.activity_logs (username, role, action, day, occurred_at) VALUES ($1, $2, $3, $4, $5)',
    [user.username, user.role, action, day, new Date().toISOString()]
  );
}

app.get('/api/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session.user), user: req.session.user ? { username: req.session.user.username, role: req.session.user.role } : null, serverDate: saoPauloDate() });
});
app.post('/api/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM app_private.users WHERE username = $1 AND role = 'user'", [String(username || '').trim()]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) return res.status(401).json({ error: 'Não foi possível entrar. Confira seu usuário e sua senha.' });
  await regenerateSession(req);
  req.session.user = { id: user.id, username: user.username, role: user.role };
  await recordActivity(req.session.user, 'login');
  res.json({ ok: true });
}));
app.post('/api/register', registrationLimiter, asyncHandler(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username)) {
    return res.status(400).json({ error: 'Escolha um usuário de 3 a 32 caracteres, usando letras, números, ponto, hífen ou sublinhado.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Sua senha precisa ter pelo menos 8 caracteres.' });
  let userId;
  try {
    const result = await pool.query(
      "INSERT INTO app_private.users (username, password_hash, role) VALUES ($1, $2, 'user') RETURNING id",
      [username, bcrypt.hashSync(password, 12)]
    );
    userId = result.rows[0].id;
  } catch (error) {
    if (error.code !== '23505') throw error;
    return res.status(409).json({ error: 'Esse nome de usuário já está em uso. Escolha outro.' });
  }
  await regenerateSession(req);
  req.session.user = { id: userId, username, role: 'user' };
  await recordActivity(req.session.user, 'login');
  res.status(201).json({ ok: true });
}));
app.post('/api/admin/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM app_private.users WHERE username = $1 AND role = 'admin'", [String(username || '').trim()]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) return res.status(401).json({ error: 'Acesso não reconhecido. Confira os dados e tente novamente.' });
  await regenerateSession(req);
  req.session.user = { id: user.id, username: user.username, role: user.role };
  await recordActivity(req.session.user, 'login');
  res.json({ ok: true });
}));
app.post('/api/logout', (req, res, next) => req.session.destroy((error) => error ? next(error) : res.json({ ok: true })));
app.get('/api/days', requireUser, asyncHandler(async (req, res) => {
  const [progress, days] = await Promise.all([
    pool.query('SELECT day FROM app_private.progress WHERE user_id = $1', [req.session.user.id]),
    pool.query('SELECT day, type FROM app_private.days ORDER BY day')
  ]);
  const opened = new Set(progress.rows.map((row) => row.day));
  res.json(days.rows.map((day) => publicDay({ ...day, opened: opened.has(day.day) })));
}));
app.post('/api/days/:number/open', requireUser, asyncHandler(async (req, res) => {
  const number = Number(req.params.number);
  const day = await getDay(number);
  if (!day) return res.status(404).json({ error: 'Este dia não foi encontrado.' });
  if (number > currentAdventDay()) return res.status(403).json({ error: `Calma! Este presente só abre no dia ${number} de dezembro.` });
  await pool.query('INSERT INTO app_private.progress (user_id, day) VALUES ($1, $2) ON CONFLICT(user_id, day) DO NOTHING', [req.session.user.id, number]);
  await recordActivity(req.session.user, 'open_day', number);
  res.json(day);
}));
app.get('/api/days/:number/qr', requireUser, asyncHandler(async (req, res) => {
  const number = Number(req.params.number);
  const day = await getDay(number);
  const { rows: openedRows } = await pool.query('SELECT 1 FROM app_private.progress WHERE user_id = $1 AND day = $2', [req.session.user.id, number]);
  const opened = openedRows[0];
  if (!day || !opened || day.type !== 'music' || !day.media_url) return res.status(404).json({ error: 'QR Code indisponível.' });
  const qrTarget = day.media_url;
  try { res.json({ dataUrl: await QRCode.toDataURL(qrTarget, { width: 220, margin: 1, color: { dark: '#10241e', light: '#ffffff' } }) }); }
  catch { res.status(500).json({ error: 'Não foi possível gerar o QR Code.' }); }
}));

app.get('/api/admin/days', requireAdmin, asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM app_private.days ORDER BY day');
  res.json(rows);
}));
app.put('/api/admin/days/:number', requireAdmin, asyncHandler(async (req, res) => {
  const number = Number(req.params.number);
  const { type, reference = '', title = '', content = '', media_url = '' } = req.body || {};
  if (!await getDay(number)) return res.status(404).json({ error: 'Dia não encontrado.' });
  if (!['verse', 'challenge', 'video', 'music'].includes(type)) return res.status(400).json({ error: 'Escolha um tipo de conteúdo válido.' });
  const mediaUrl = String(media_url).trim();
  const validRemoteUrl = /^https:\/\//i.test(mediaUrl);
  if (mediaUrl && !validRemoteUrl) return res.status(400).json({ error: 'Use um link HTTPS válido ou envie um arquivo de mídia.' });
  const { rows } = await pool.query(
    'UPDATE app_private.days SET type = $1, reference = $2, title = $3, content = $4, media_url = $5, updated_at = CURRENT_TIMESTAMP WHERE day = $6 RETURNING *',
    [type, String(reference).slice(0, 160), String(title).slice(0, 160), String(content).slice(0, 10000), mediaUrl.slice(0, 1000), number]
  );
  res.json(rows[0]);
}));
app.post('/api/admin/days/:number/media', requireAdmin, upload.single('media'), asyncHandler(async (req, res) => {
  const number = Number(req.params.number);
  const day = await getDay(number);
  if (!day) return res.status(404).json({ error: 'Dia não encontrado.' });
  if (!req.file) return res.status(400).json({ error: 'Escolha um arquivo para enviar.' });
  const extension = path.extname(req.file.originalname).toLowerCase();
  if ((day.type === 'video' && extension !== '.mp4') || (day.type === 'music' && extension !== '.mp3') || (day.type !== 'video' && day.type !== 'music')) {
    return res.status(400).json({ error: 'O formato do arquivo não corresponde ao tipo de conteúdo deste dia.' });
  }
  if (extension === '.mp3' && req.file.size > 30 * 1024 * 1024) {
    return res.status(413).json({ error: 'O arquivo de música ultrapassa o limite de 30 MB.' });
  }
  const objectName = `${crypto.randomUUID()}${extension}`;
  const contentType = extension === '.mp4' ? 'video/mp4' : 'audio/mpeg';
  const { error: uploadError } = await supabase.storage.from(storageBucket).upload(objectName, req.file.buffer, { contentType, upsert: false });
  if (uploadError) throw new Error(`O Supabase Storage recusou o arquivo: ${uploadError.message}`);
  const { data } = supabase.storage.from(storageBucket).getPublicUrl(objectName);
  const mediaUrl = data.publicUrl;
  try {
    await pool.query('UPDATE app_private.days SET media_url = $1, updated_at = CURRENT_TIMESTAMP WHERE day = $2', [mediaUrl, number]);
    await cleanupMedia(day.media_url);
  } catch (error) {
    await supabase.storage.from(storageBucket).remove([objectName]);
    throw error;
  }
  res.json({ media_url: mediaUrl });
}));
app.delete('/api/admin/days/:number/media', requireAdmin, asyncHandler(async (req, res) => {
  const number = Number(req.params.number);
  const day = await getDay(number);
  if (!day) return res.status(404).json({ error: 'Dia não encontrado.' });
  await pool.query("UPDATE app_private.days SET media_url = '', updated_at = CURRENT_TIMESTAMP WHERE day = $1", [number]);
  await cleanupMedia(day.media_url);
  res.json({ ok: true });
}));
app.get('/api/admin/users', requireAdmin, asyncHandler(async (_req, res) => {
  const { rows } = await pool.query("SELECT id, username, created_at FROM app_private.users WHERE role = 'user' ORDER BY username");
  res.json(rows);
}));
app.get('/api/admin/activity', requireAdmin, asyncHandler(async (req, res) => {
  const action = ['login', 'open_day'].includes(req.query.type) ? req.query.type : null;
  const query = action
    ? 'SELECT username, role, action, day, occurred_at FROM app_private.activity_logs WHERE action = $1 ORDER BY id DESC LIMIT 300'
    : 'SELECT username, role, action, day, occurred_at FROM app_private.activity_logs ORDER BY id DESC LIMIT 300';
  const { rows } = action ? await pool.query(query, [action]) : await pool.query(query);
  res.json(rows);
}));
app.post('/api/admin/users', requireAdmin, asyncHandler(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[\p{L}\p{N}_.-]{3,32}$/u.test(username) || password.length < 8) return res.status(400).json({ error: 'Use um usuário de 3 a 32 caracteres e uma senha com pelo menos 8 caracteres.' });
  try {
    const { rows } = await pool.query(
      "INSERT INTO app_private.users (username, password_hash, role) VALUES ($1, $2, 'user') RETURNING id",
      [username, bcrypt.hashSync(password, 12)]
    );
    res.status(201).json({ id: rows[0].id, username });
  } catch (error) {
    if (error.code !== '23505') throw error;
    res.status(409).json({ error: 'Já existe uma conta com esse usuário.' });
  }
}));
app.patch('/api/admin/users/:id/password', requireAdmin, asyncHandler(async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
  const result = await pool.query("UPDATE app_private.users SET password_hash = $1 WHERE id = $2 AND role = 'user'", [bcrypt.hashSync(password, 12), Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Conta não encontrada.' });
  res.json({ ok: true });
}));
app.delete('/api/admin/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query("DELETE FROM app_private.users WHERE id = $1 AND role = 'user'", [Number(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: 'Conta não encontrada.' });
  res.json({ ok: true });
}));
app.post('/api/admin/test-mode', requireAdmin, (req, res) => {
  req.session.testMode = Boolean(req.body?.enabled);
  req.session.testDay = Math.max(1, Math.min(25, Number(req.body?.day) || 1));
  res.json({ enabled: req.session.testMode, day: req.session.testDay });
});
app.get('/api/admin/test-mode', requireAdmin, (req, res) => {
  res.json({ enabled: Boolean(req.session.testMode), day: req.session.testDay || 1 });
});
app.get('/api/admin/preview/:number', requireAdmin, asyncHandler(async (req, res) => {
  const number = Number(req.params.number);
  if (!req.session.testMode) return res.status(403).json({ error: 'Ative o modo de teste para pré-visualizar um dia.' });
  const day = await getDay(number);
  if (!day) return res.status(404).json({ error: 'Dia não encontrado.' });
  res.json({ ...day, testMode: Boolean(req.session.testMode), previewDay: req.session.testDay });
}));
app.patch('/api/admin/password', requireAdmin, asyncHandler(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const { rows } = await pool.query("SELECT * FROM app_private.users WHERE id = $1 AND role = 'admin'", [req.session.user.id]);
  const admin = rows[0];
  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) return res.status(401).json({ error: 'A senha atual não confere.' });
  if (newPassword.length < 10) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 10 caracteres.' });
  await pool.query('UPDATE app_private.users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(newPassword, 12), admin.id]);
  res.json({ ok: true });
}));

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
  const isTooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
  const message = isTooLarge ? 'O arquivo ultrapassa o limite permitido.' : (error.status && error.status < 500 ? error.message : 'Ocorreu um erro inesperado.');
  if (!error.status || error.status >= 500) console.error(error);
  res.status(isTooLarge ? 413 : (error.status || 500)).json({ error: message });
});

async function start() {
  await initializeDatabase();
  await initializeStorage();
  app.listen(port, () => console.log(`Calendário Advento disponível na porta ${port}.`));
}

start().catch(async (error) => {
  console.error(`Não foi possível iniciar o aplicativo: ${error.message}`);
  await pool.end();
  process.exitCode = 1;
});
