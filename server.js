require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 3000;

if (!process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.ADMIN_TOKEN) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Basic in-memory rate limiter
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

// Log events to Supabase
async function logEvent(eventType, details = {}) {
  try {
    const { error } = await supabase
      .from("security_events")
      .insert({
        event_type: eventType,
        details: details
      });

    if (error) {
      console.error("Event storage error:", error.message);
    }
  } catch (err) {
    console.error("Event logging failed");
  }
}

// Public health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    application: "ZenBank Security Lab"
  });
});

// Public simulated security event endpoint
app.post("/api/security-event", async (req, res) => {
  const allowedTypes = [
    "simulation",
    "suspicious_activity",
    "bot_detection",
    "security_test"
  ];

  const eventType = req.body.event_type;

  if (!allowedTypes.includes(eventType)) {
    return res.status(400).json({
      error: "Invalid event type"
    });
  }

  // Only accept a small, controlled set of fields.
  // Never store passwords, banking PINs, tokens or submitted credentials.

  await logEvent(eventType, {
    source: "public_simulation"
  });

  res.json({
    success: true,
    message: "Simulation event recorded"
  });
});

// Admin authentication
function requireAdmin(req, res, next) {
  const token = req.headers.authorization;

  if (!token ||
      token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}

// Admin event feed
app.get("/api/admin/events", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("security_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: "Unable to retrieve events"
    });
  }
});

// Admin statistics
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("security_events")
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
    res.status(500).json({
      error: "Unable to retrieve statistics"
    });
  }
});

// Decoy routes
const decoyRoutes = [
  "/wp-admin",
  "/wp-login.php",
  "/phpmyadmin",
  "/administrator",
  "/.env"
];

decoyRoutes.forEach(route => {
  app.all(route, async (req, res) => {
    await logEvent("suspicious_activity", {
      route: route
    });

    res.status(404).send("Not found");
  });
});

// Serve files from repository root
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(__dirname));

// Error handling
app.use((err, req, res, next) => {
  console.error("Server error");

  res.status(500).json({
    error: "Internal server error"
  });
});

app.listen(PORT, () => {
  console.log(`ZenBank Lab running on port ${PORT}`);
});
