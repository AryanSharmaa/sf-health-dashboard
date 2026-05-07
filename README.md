# SF Health Dashboard

A web-based SaaS tool that audits Salesforce orgs and Marketing Cloud accounts, returning a 0–100 health score with prioritised remediation actions.

Live: **https://sf-health-dashboard.onrender.com**

---

## Salesforce Connection

Connect via the official Salesforce login page — the application never sees your password. Uses OAuth 2.0 Web Server Flow with PKCE (S256). Supports Production and Sandbox orgs.

---

## Marketing Cloud Connection

Marketing Cloud requires an Installed Package for API access. The package is created **once per org, ever** — credentials are saved encrypted in the database so every subsequent audit only requires the MID or EID.

### First-time setup (one-time per org, ~5 minutes)

1. Log in to Marketing Cloud → click your name (top-right) → **Setup**
2. Go to **Platform Tools → Apps → Installed Packages**
3. Click **New** → give it a name (e.g. `SF Health Dashboard`) → **Save**
4. Under **Components**, click **Add Component → API Integration**
5. Select **Server-to-Server** → **Next**
6. Grant these read-only scopes:
   - Automation: `Read`
   - Contacts: `Read`, `Write` (required for contact data schema)
   - Data: `Read`
   - Email: `Read`
   - Journey Builder: `Read`
   - List and Subscribers: `Read`
   - Tracking Events: `Read`, `Write`
7. Click **Save** — you will see a **Client ID** and **Client Secret** on the package summary screen
8. Copy the **Subdomain** from the REST Base URI (e.g. `mcABCDEF` from `https://mcABCDEF.rest.marketingcloudapis.com`)
9. Paste the subdomain, Client ID, and Client Secret into the **Connect New Org** form in the dashboard

Credentials are encrypted (AES-256-GCM) and stored. The package can remain in place — it is read-only and has no impact on the MC account.

### Repeat audits (zero input from customer)

Open the MC connect modal — previously connected orgs appear as one-click buttons. Click the org → the dashboard fetches a fresh token automatically and starts the audit. No credentials re-entered, no customer involvement.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `SF_CLIENT_ID` | Salesforce Connected App client ID |
| `SF_CLIENT_SECRET` | Salesforce Connected App client secret |
| `SF_REDIRECT_URI` | OAuth callback URL |
| `SESSION_SECRET` | Express session signing key |
| `DATABASE_URL` | PostgreSQL connection string (omit for local SQLite) |
| `OPENROUTER_API_KEY` | AI remediation guide (OpenRouter) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Email report delivery |
| `APP_URL` | Base URL for share links and OAuth callbacks |
| `ALLOWED_ORIGINS` | CORS allow-list (comma-separated) |
| `MC_CRED_SECRET` | **32+ char secret for encrypting MC credentials at rest** |

`MC_CRED_SECRET` must be set in production. If omitted a dev fallback is used (insecure).

---

## Local Development

```bash
npm install
# create a .env file with the variables above
npm start
```

The app runs on `http://localhost:3000`. SQLite is used automatically when `DATABASE_URL` is not set.

---

## Deployment (Render)

Auto-deploys on push to `main`. Set all environment variables in the Render dashboard — never commit them to the repo.
