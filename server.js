
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());
app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 3000;

// =====================================
// ENVIRONMENT VARIABLES
// =====================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_TOKEN) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

// =====================================
// SUPABASE CONNECTION
// =====================================

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// =====================================
// RATE LIMITER
// =====================================

const requests = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 60;

  let record = requests.get(ip);

  if (!record || now - record.start > windowMs) {
    record = { start: now, count: 0 };
  }

  record.count++;
  requests.set(ip, record);

  if (record.count > maxRequests) {
    logEvent("rate_limit", {
      message: "Request limit exceeded"
    });

    return res.status(429).json({
      error: "Too many requests"
    });
  }

  next();
}

app.use(rateLimit);

// =====================================
// SECURITY EVENT LOGGER
// Uses audit_events table
// =====================================

async function logEvent(eventType, details = {}, req = null) {
  try {
    const { error } = await supabase
      .from("audit_events")
      .insert({
        event_type: eventType,
        severity: "low",
        ip_address: req ? req.ip : null,
        details: details
      });

    if (error) {
      console.error("Event storage error:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Event logging failed.");
    return false;
  }
}

// =====================================
// HEALTH CHECK
// =====================================

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    application: "ZenBank Security Lab"
  });
});

// =====================================
// DATABASE CONNECTION TEST
// =====================================

app.get("/api/database-check", requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from("audit_events")
      .select("id")
      .limit(1);

    if (error) throw error;

    res.json({
      success: true,
      database: "connected"
    });
  } catch (err) {
    console.error("Database check failed:", err.message);

    res.status(500).json({
      success: false,
      database: "connection failed"
    });
  }
});

// =====================================
// PUBLIC SECURITY EVENT SIMULATION
// =====================================

app.post("/api/security-event", async (req, res) => {
  const allowedTypes = [
    "simulation",
    "suspicious_activity",
    "bot_detection",
    "security_test"
  ];

  const eventType = req.body?.event_type;

  if (!allowedTypes.includes(eventType)) {
    return res.status(400).json({
      error: "Invalid event type"
    });
  }

  const saved = await logEvent(
    eventType,
    {
      source: "public_simulation"
    },
    req
  );

  if (!saved) {
    return res.status(500).json({
      error: "Unable to record event"
    });
  }

  res.json({
    success: true,
    message: "Simulation event recorded"
  });
});

// =====================================
// ADMIN AUTHENTICATION
// =====================================

function requireAdmin(req, res, next) {
  const token = req.headers.authorization;

  if (!token || token !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}

// =====================================
// ADMIN EVENT FEED
// =====================================

app.get("/api/admin/events", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("Event retrieval failed:", err.message);

    res.status(500).json({
      error: "Unable to retrieve events"
    });
  }
});

// =====================================
// ADMIN STATISTICS
// =====================================

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("audit_events")
      .select("event_type");

    if (error) throw error;

    const stats = {};

    for (const event of data) {
      stats[event.event_type] =
        (stats[event.event_type] || 0) + 1;
    }

    res.json({
      total: data.length,
      categories: stats
    });
  } catch (err) {
    console.error("Statistics retrieval failed:", err.message);

    res.status(500).json({
      error: "Unable to retrieve statistics"
    });
  }
});

// =====================================
// DECOY ROUTES
// =====================================

const decoyRoutes = [
  "/wp-admin",
  "/wp-login.php",
  "/phpmyadmin",
  "/administrator",
  "/.env"
];

decoyRoutes.forEach(route => {
  app.all(route, async (req, res) => {
    await logEvent(
      "suspicious_activity",
      { route },
      req
    );

    res.status(404).send("Not found");
  });
});

// =====================================
// ADMIN PAGE
// =====================================

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// =====================================
// HOMEPAGE
// =====================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =====================================
// STATIC FILES
// =====================================

app.use(express.static(__dirname));

// =====================================
// ERROR HANDLER
// =====================================

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  res.status(500).json({
    error: "Internal server error"
  });
});

// =====================================
// START SERVER
// =====================================

app.listen(PORT, () => {
  console.log(`ZenBank Lab running on port ${PORT}`);
});
