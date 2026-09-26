# DineIQ Analytics Frontend

A plain-JavaScript (`.jsx`, no TypeScript) React app for the DineIQ Analytics Data
Science Intelligence Arena — separate from the operational, TypeScript `frontend/` app
in this repo. Talks to `src/api/main.py` (FastAPI, default port 8010).

## Setup

```bash
cd frontend-analytics
npm install
npm run dev
```

Opens at `http://localhost:5174`, proxying `/api/*` to `http://localhost:8010`.

## Pages (role-based)

| Role | Default landing page | Visible nav items |
|---|---|---|
| Executive | Executive Dashboard | Executive Dashboard, Menu Matrix, What-If Simulator, Recommendations |
| Restaurant Manager | Executive Dashboard | Executive Dashboard, Menu Matrix, What-If Simulator, Recommendations |
| Data Engineer | Data Ingestion Trigger | Dual-Pipeline Verification, Data Ingestion Trigger |
| Analyst | Menu Matrix | Menu Matrix, Dual-Pipeline Verification, What-If Simulator, Recommendations |

Switch roles from the dropdown at the top of the sidebar — this is a client-side demo
role switch (no authentication), matching the analytics-arena's read-mostly scope.
