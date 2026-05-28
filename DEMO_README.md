# sklad kontur: demo runbook

## 1. Install

```bash
npm install
```

## 2. Demo env

Use `.env.demo.example` as a safe public template. For a real local demo, create `.env` from it and add private Telegram/VK tokens locally.

Important demo settings:

- `ENABLE_DEMO_SEED=true`: fills an empty local JSON database with demo data.
- `TENANT_OTP_CODE=1234`: fixed tenant login code for demo.
- `ALLOW_OTP_WITHOUT_DELIVERY=true`: tenant OTP works even without real Telegram/VK delivery.
- `FILE_STORAGE_DRIVER=local`: files are stored locally for demo.

Do not commit `.env`. It is intentionally ignored.

## 3. Run

Start API and web in two terminals:

```bash
npm run dev:api
npm run dev:web
```

Open: `http://localhost:5173`

## 4. Demo accounts

| Role | Login | Password / code |
| --- | --- | --- |
| Admin | `admin@skladkontur.local` | `admin123` |
| Manager | `manager@skladkontur.local` | `manager123` |
| Worker | `worker@skladkontur.local` | `worker123` |
| Tenant 1 | `+79990000001` | OTP `1234` |
| Tenant 2 | `+79990000002` | OTP `1234` |

## 5. Demo flow

### Flow 1: Manager overview

1. Sign in as manager: `manager@skladkontur.local` / `manager123`.
2. Show dashboard metrics, cashflow forecast, service notifications.
3. Open tenants and show a tenant card.
4. Show tabs for base info, contracts, payments, notes, and tickets.

### Flow 2: Tenant service ticket

1. Open an incognito tab.
2. Sign in as tenant with `+79990000001` and code `1234`.
3. Create a service ticket.
4. Return to manager and show the new ticket.
5. Assign a worker and move the ticket through the service workflow.

### Flow 3: Admin portfolio

1. Sign in as admin: `admin@skladkontur.local` / `admin123`.
2. Show multi-property dashboard.
3. Open staff management and explain role separation.
4. Show that worker surfaces are service-only and do not expose finance.

## 6. Before the demo

- Run the three flows once.
- Check mobile view in browser DevTools: iPhone 14 or 390px width.
- Avoid showing empty or unfinished admin import screens unless needed.
- Keep the story focused on warehouse operations: tenants, spaces, contracts, tickets, payments, notifications.
