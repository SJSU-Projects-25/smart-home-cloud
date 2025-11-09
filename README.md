# Smart Home Cloud Platform Demo

This repo contains a single-page React/Tailwind console that simulates the CMPE 281 “Smart Home Cloud Platform” end-to-end: role-based login, device manager, ingestion workflow, ML/alert lifecycle, notification policies, and model threshold tuning. It is designed to front a future FastAPI/Postgres/RabbitMQ backend, but today everything runs client-side on top of Firebase Auth + Firestore.

## Highlights
- **Landing → Register → Login funnel** mirrors the System Analysis & Design doc so stakeholders can experience onboarding before jumping into the console.
- **Owner/Admin/Tech console** lives entirely in `client/src/App.jsx` (per single-file requirement) with Tailwind styling and lucide-react icons.
- **Firestore-backed simulations** replace AWS/GCP components:
  - Devices collection = RDS device inventory.
  - `/events` + 3s timeout emulate S3 presign + SQS + inference worker.
  - Alert actions log to console/toast as SNS/SES fan-out stand-ins.
  - Contacts, quiet hours, and per-class thresholds map to notification policies + model tuning tables.

## Tech Stack
| Layer | Implementation |
| --- | --- |
| Frontend | React 19 + Vite + Tailwind CSS + lucide-react |
| State/Data | Firebase Auth (anonymous/custom token) + Firestore collections |
| Tooling | npm, eslint, PostCSS, Vite |

## Project Structure
```
client/
 ├─ src/
 │   ├─ App.jsx          # all UI + Firebase logic in one file (requirement)
 │   ├─ main.jsx         # bootstraps React
 │   └─ index.css        # Tailwind directives
 ├─ index.html           # injects Firebase globals (see below)
 ├─ package.json         # scripts/deps
 └─ tailwind.config.js   # Tailwind content paths
```

## Getting Started
```bash
cd client
npm install
npm run dev
```
Open the printed localhost URL (default `http://localhost:5173`).

### Firebase configuration
Before running, provide real project values in `client/index.html`:
```html
<script>
  window.__firebase_config = { ... }; // copy/paste from Firebase console
  window.__app_id = 'smart-home-demo';
  // window.__initial_auth_token = 'optional-custom-token';
</script>
```
The app falls back to anonymous auth when `__initial_auth_token` is omitted. Firestore security rules should allow the demo user to read/write the `devices`, `events`, `alerts`, `contacts`, `home_policies`, `home_models`, and `home_registrations` collections.

### Simulated cloud flows
| UI Action | Simulated Cloud Component |
| --- | --- |
| Register home | writes to `home_registrations` instead of calling the FastAPI onboarding endpoint |
| Add Device / Heartbeat | Firestore replaces IoT Core + RDS writes |
| Send Test Clip | Firestore `/events` doc + timeout stand in for S3 + SQS + inference worker |
| Alert Ack/Escalate/Close | Firestore update + toast/log representing SNS/SES fan-out |
| Contacts / Quiet hours | Mirror notification policies + escalation windows |
| Model sliders | Emulate per-class threshold tuning + model governance UI |

## Useful Scripts
| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | ESLint check |

## Next Steps
- Swap Firebase calls for FastAPI endpoints (devices, alerts, policies, models) once backend is ready.
- Feed live WebSocket alerts by hooking into the future RabbitMQ/Celery pipeline.
- Move registration + contact forms to the official onboarding/notification services when those APIs land.
