import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getStatusPayload } from "./lib/status.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4173;

app.get("/api/status", async (_req, res) => {
  try {
    const payload = await getStatusPayload();
    res.set("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || "status probe failed" });
  }
});

// Local only — on Vercel, public/ is served by the CDN (express.static is ignored).
if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, "public")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`PLayTR status meter → http://localhost:${PORT}`);
  });
}

export default app;
