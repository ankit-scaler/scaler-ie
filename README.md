# Scaler IE — Interview Vault

Free stack, zero cost, 1000 DAU safe.

**Stack:** Next.js 14 (Vercel free) · Supabase (free) · GitHub Actions cron (free) · Google OAuth (free) · Google Sheets API (free).

---

## What you get

- Google login for anyone.
- Questions page: Program → Company → Role → Round filters + search. Modern dark UI, glassy cards with depth.
- Assignments page: Company + Role filters, links from the sheet open in a new tab.
- Packets for Hirings page: interview-prep packets grouped by Role + YoE, each with its session recordings ("Watch these to brush up your concepts").
- Admin page (only for admins): unique users, views, minutes, Company–Role breakdown, per-user table, packet/session tracking by user and by Role/YoE, packet-link management, CSV export, add/remove admins. Charts + a custom date-range filter, on top of 24h / 7d / 30d presets.
- Daily sync at 23:00 IST — no human needed.

---

## One-time setup (~30 minutes)

### 1. Supabase
1. Create free project at supabase.com → note **Project URL**, **anon key**, **service role key**.
2. SQL editor → paste `supabase/schema.sql` → run.
3. (Optional, one-time) SQL editor → paste `supabase/seed_packets.sql` → run. Seeds the **Packets for Hirings** page with the current role/YoE packet + session-recording list. Doc/recording URLs start blank — fill them in from Admin → **Manage packet links** once you're signed in as an admin.
3. Authentication → Providers → **Google** → enable. In Google Cloud Console (step 2 below) you'll get a Client ID/Secret to paste here.
4. Authentication → URL Configuration → add your Vercel URL (e.g. `https://scaler-ie.vercel.app`) to **Site URL** and to **Redirect URLs** as `https://scaler-ie.vercel.app/auth/callback`.

### 2. Google Cloud (for OAuth + Sheets sync)
1. Create a GCP project (free).
2. **OAuth consent screen** → External, add scopes `email`, `profile`, `openid`.
3. **Credentials → OAuth Client ID** → Web application.
   - Authorized redirect URI: `https://YOUR-SUPABASE-PROJECT.supabase.co/auth/v1/callback`
   - Copy Client ID + Secret → paste into Supabase → Google provider.
4. **APIs & Services → Enable APIs**: enable **Google Sheets API**.
5. **Credentials → Service Account** → create → key type JSON → download.
6. Open the interview-experiences Google Sheet → Share → paste the service account's email (`xxx@yyy.iam.gserviceaccount.com`) → **Viewer**.

### 3. Vercel
1. Push this repo to GitHub.
2. Import into Vercel → framework detected as Next.js.
3. Env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
4. Deploy.

### 4. GitHub Actions (daily sync)
In the repo → Settings → Secrets → Actions → add:
- `SHEET_ID` — from the Google Sheet URL
- `SUPABASE_URL` — same as above
- `SUPABASE_SERVICE_KEY` — same as above
- `GOOGLE_CREDS_JSON` — paste the entire service-account JSON

Trigger a run manually once (Actions tab → **Daily Sheet Sync** → Run workflow) to populate the DB.

Cron runs daily at 17:30 UTC = 23:00 IST.

---

## Local dev

```bash
cp .env.example .env.local   # fill values
npm install
npm run dev
```

## Add an admin
Log in as `ankit.mishra@scaler.com` → Admin → Add admin field.

## Notes
- Users' sessions are counted via a 30-second heartbeat. Gaps > 5 min start a new session.
- A "view" is logged when a user narrows filters to a specific Company + Role.
- Assignments link column: the sync tries the cell's hyperlink formula first, falls back to text.
