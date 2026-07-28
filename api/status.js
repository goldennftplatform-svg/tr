import { getStatusPayload } from "../lib/status.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const payload = await getStatusPayload();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "status probe failed" });
  }
}

export const config = {
  maxDuration: 30,
};
