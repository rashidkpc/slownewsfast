# slownewsfast

Convert email newsletters into Atom feeds. A Cloudflare-native replacement for kill-the-newsletter.

## Architecture

| Layer | Technology |
|---|---|
| Email ingest | Cloudflare Email Routing → Worker `email()` handler |
| Email parsing | `postal-mime` |
| Database | D1 (serverless SQLite) |
| Attachments | R2 (object storage) |
| Web UI | React + Tailwind CSS v4, served via Workers Static Assets |
| API + feed generation | Cloudflare Worker (Hono) |
| Auth | HMAC-signed session cookie, single password |
| Cleanup | Cron trigger (hourly) |

## Prerequisites

- A Cloudflare account with a domain on Cloudflare DNS
- Node.js 18+
- Wrangler CLI (`npm install -g wrangler` or use `npx`)

## Deployment

### 1. Clone and install

```bash
git clone <repo-url> slownewsfast
cd slownewsfast
npm install
```

### 2. Enable Email Routing for your subdomain

In the Cloudflare Dashboard:

1. Go to **Compute → Email Service → Email Routing**
2. Open the **Settings** tab
3. Under **Subdomains**, enter your subdomain (e.g. `slownews`) and submit

Cloudflare automatically adds MX, SPF, and DKIM records to the subdomain. The apex domain is not affected — your existing email provider continues to work.

> **Note:** The Dashboard may show the apex domain as "misconfigured" or with DNS warnings. This is expected and harmless. Only the subdomain needs to be functional. The subdomain's MX, SPF, and DKIM records are managed independently from the root domain.

### 3. Create D1 database

```bash
wrangler d1 create slownewsfast-db
```

Copy the `database_id` from the output and paste it into `wrangler.jsonc` (copy `wrangler.jsonc.example` to `wrangler.jsonc` first and fill in your values).

### 4. Create R2 bucket

```bash
wrangler r2 bucket create slownewsfast-attachments
```

### 5. Set the login password

```bash
wrangler secret put PASSWORD
```

You'll be prompted to enter a password. This is the only password needed to access the web UI. It's stored encrypted in Cloudflare's infrastructure — never in the repo.

### 6. Apply database migrations

```bash
wrangler d1 migrations apply slownewsfast-db --remote
```

### 7. Deploy the Worker

```bash
wrangler deploy
```

### 8. Wire the catch-all routing rule

In the Cloudflare Dashboard:

1. **Compute → Email Service → Email Routing → Routing Rules**
2. Select your subdomain from the domain selector
3. Enable the **Catch-all rule** toggle
4. Set **Action** to **Send to a Worker**
5. Select `slownewsfast` from the dropdown
6. **Save**

### 9. Point DNS to the Worker

Add a CNAME record in **DNS → Records** for your domain:

- **Type**: CNAME
- **Name**: your subdomain (e.g. `slownews`)
- **Target**: `slownewsfast.<your-subdomain>.workers.dev` (shown after `wrangler deploy`)
- **Proxy**: On (orange cloud)

## Local development

```bash
wrangler dev
```

To test the email handler locally:

```bash
curl --request POST 'http://localhost:8787/cdn-cgi/handler/email' \
  --url-query 'from=sender@example.com' \
  --url-query 'to=test@slownews.yourdomain.com' \
  --data-raw 'From: "Test" <sender@example.com>
To: test@slownews.yourdomain.com
Subject: Test
Content-Type: text/plain
Date: Tue, 27 Aug 2024 08:49:44 -0700
Message-ID: <test123@example.com>

Hello from local dev!'
```

## Usage

1. Visit `https://slownews.yourdomain.com` and sign in with your password
2. Create a feed — you get a unique email address and an Atom feed URL
3. Use the email address when subscribing to newsletters
4. Add the feed URL to any feed reader (NetNewsWire, Feedly, etc.)
5. Each newsletter email becomes a new entry in your feed

### Feed URLs are public

Feed URLs (`/feeds/*.xml`, entry pages, and file attachments) are publicly accessible so they work with any feed reader. Only the web UI and API require authentication.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run build` | Production build |
| `npm run deploy` | Deploy to Cloudflare |
| `wrangler types` | Regenerate TypeScript types |
| `wrangler tail` | Stream live logs |
| `wrangler secret put PASSWORD` | Change the login password |
