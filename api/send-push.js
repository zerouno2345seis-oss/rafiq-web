// api/send-push.js — مُرسِل إشعارات FCM v1 (Vercel Serverless Function)
const crypto = require("crypto");
const b64url = (s) => Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function googleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." +
    b64url(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now, exp: now + 3600,
    }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const sig = signer.sign(sa.private_key).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = unsigned + "." + sig;
  const r = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  return j.access_token;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-rafiq-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (process.env.RAFIQ_PUSH_KEY && req.headers["x-rafiq-key"] !== process.env.RAFIQ_PUSH_KEY)
      return res.status(401).json({ error: "unauthorized" });
    const saRaw = process.env.FIREBASE_SA;
    if (!saRaw) return res.status(500).json({ error: "FIREBASE_SA missing" });
    const sa = JSON.parse(saRaw);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { to_token, title, message, urgent } = body;
    if (!to_token) return res.status(400).json({ error: "to_token required" });
    const access = await googleAccessToken(sa);
    const payload = {
      message: {
        token: to_token,
        notification: { title: urgent ? "\u{1F6A8} " + (title || "رسالة مستجلة") : (title || "رفيق"), body: message || "" },
        data: { title: title || "رفيق", body: message || "", urgent: urgent ? "1" : "0" },
        android: {
          priority: urgent ? "HIGH" : "NORMAL",
          notification: { sound: urgent ? "rafiq_urgent" : "default", channel_id: urgent ? "rafiq_urgent" : "rafiq_reminders" },
        },
      },
    };
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await r.json();
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok, fcm: out });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
