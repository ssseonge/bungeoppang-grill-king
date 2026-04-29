const crypto = require("node:crypto");

const SCORE_LIMIT = 20;

module.exports = async function handler(req, res) {
  setJsonHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    send(res, 503, { error: "Supabase environment variables are not configured." });
    return;
  }

  try {
    if (req.method === "GET") {
      send(res, 200, { scores: await getLeaderboard() });
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const payload = toScorePayload(body, req);
      await supabaseFetch("scores", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(payload),
      });
      send(res, 200, { saved: true, scores: await getLeaderboard() });
      return;
    }

    res.setHeader("Allow", "GET, POST, OPTIONS");
    send(res, 405, { error: "Method not allowed." });
  } catch (error) {
    const status = error.status || 500;
    send(res, status, { error: error.publicMessage || "Score API failed." });
  }
};

function setJsonHeaders(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function send(res, status, data) {
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function toScorePayload(body, req) {
  const name = cleanName(body.name);
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";

  if (!deviceId || deviceId.length > 120) {
    throw publicError(400, "Device id is invalid.");
  }

  return {
    player_name: name || "무명",
    device_id_hash: hashDeviceId(deviceId, req.headers["user-agent"] || ""),
    score: cleanInteger(body.score, 0, 99999999),
    best_combo: cleanInteger(body.bestCombo, 0, 9999),
    made: cleanInteger(body.made, 0, 99999),
    served: cleanInteger(body.served, 0, 99999),
  };
}

function cleanName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 12);
}

function cleanInteger(value, min, max) {
  const next = Number.parseInt(value, 10);
  if (!Number.isFinite(next)) return min;
  return Math.max(min, Math.min(max, next));
}

function hashDeviceId(deviceId, userAgent) {
  const secret = process.env.SCORE_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return crypto
    .createHash("sha256")
    .update(`${secret}:${deviceId}:${userAgent}`)
    .digest("hex");
}

async function getLeaderboard() {
  const rows = await supabaseFetch("scores", {
    search: {
      select: "player_name,score,best_combo,made,served,created_at",
      order: "score.desc,best_combo.desc,served.desc,created_at.desc",
      limit: String(SCORE_LIMIT),
    },
  });
  return rows.map((row) => ({
    name: row.player_name,
    score: row.score,
    bestCombo: row.best_combo,
    made: row.made,
    served: row.served,
    createdAt: row.created_at,
  }));
}

async function supabaseFetch(path, options = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(options.search || {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body,
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = publicError(response.status, "Supabase request failed.");
    error.detail = detail;
    throw error;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function publicError(status, publicMessage) {
  const error = new Error(publicMessage);
  error.status = status;
  error.publicMessage = publicMessage;
  return error;
}
