# PLayTR — playtrenches.com status meter

Local status board that probes PlayTrenches frontend + backend and shows live meters.

## Run

```bash
npm install
npm start
```

Open http://localhost:4173

## What it checks

| Meter | Targets |
| --- | --- |
| Frontend | `www.playtrenches.com`, Unity WebGL build, Vercel Blob Addressables |
| Backend | `trenches-api.vercel.app/api/health`, tournament API, clipping app |
| Multiplayer | Photon Realtime name-server pings |
| Solana | Public mainnet RPC `getHealth` |
| Auth | Privy custom domain |

`GET /api/status` returns the raw probe JSON (used by the UI, refreshes every 30s).
