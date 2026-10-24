# Deploying ReignRoom (free tiers)

Everything runs on free plans: one **Cloudflare Worker** serves the site and the rooms (Durable
Objects), and **GitHub** hosts the code and builds the host agent. Time needed: about 30 minutes
the first time.

You need: Node.js 22+, Git, a GitHub account, and a Cloudflare account (free; no domain needed).

---

## 1. Put the code on GitHub

1. On github.com, create a new **empty** repository (no README), e.g. `reignroom`. Public lets
   anyone verify the agent build; private works too.
2. In the project folder:

```bash
git remote add origin https://github.com/<you>/reignroom.git
```

```bash
git push -u origin master
```

The **CI** workflow runs on every push (site + Worker tests, agent tests on Windows). Check the
**Actions** tab shows it green.

## 2. Site settings

Copy `apps/web/.env.production.example` to `apps/web/.env.production` and fill in:

- `VITE_REPO_URL`: `https://github.com/<you>/reignroom` (agent downloads and hashes on the host guide)
- `VITE_CONTACT_EMAIL`: the address for copyright notices (shown publicly on /contact)

Both are public values; committing the file is fine.

## 3. Sign in to Cloudflare (once)

```bash
npx wrangler login
```

A browser window opens; sign in and allow access. If you've never used Workers, the dashboard asks
you to pick a free **workers.dev subdomain** the first time (Workers & Pages).

## 4. Optional: a TURN relay

Without it, most players connect directly. Add one if someone's network never gets a picture (see
docs/testing-across-networks.md). In `apps/worker`:

- Cloudflare Realtime TURN (1,000 GB/month free): create a TURN key in the Cloudflare dashboard
  (Realtime section), then

```bash
npx wrangler secret put TURN_KEY_ID
```

```bash
npx wrangler secret put TURN_KEY_API_TOKEN
```

- Or a fixed-credential service such as ExpressTURN: `TURN_FALLBACK_URLS`,
  `TURN_FALLBACK_USERNAME`, `TURN_FALLBACK_CREDENTIAL` the same way.

Secrets are stored encrypted by Cloudflare and never appear in the code or the site.

## 5. Deploy

From the project folder:

```bash
npm ci
```

```bash
npm run build
```

```bash
npm run deploy -w @reignroom/worker
```

The last command prints the site address, e.g. `https://reignroom.<subdomain>.workers.dev`.

- The Worker uses the Workers **Rate Limiting** binding; Cloudflare's docs don't say whether it's
  on the free plan. If the deploy fails with an error about `ratelimits`, send me the message.

## 6. Verify the deployment

```bash
node scripts/verify-deploy.mjs https://reignroom.<subdomain>.workers.dev
```

It checks headers, routing, a missing-file 404, room creation, sockets, a full signaling burst,
ICE servers and the cross-site socket block. All lines must say PASS.

## 7. Release the host agent

1. GitHub repo → **Settings → Secrets and variables → Actions → Variables** → **New repository
   variable**: name `REIGNROOM_SITE_ORIGIN`, value your site address (no trailing slash), e.g.
   `https://reignroom.<subdomain>.workers.dev`. The agent will accept only this site.
2. Tag and push (the tag must match `agent/reignroom_agent/__init__.py`, currently 0.1.0):

```bash
git tag agent-v0.1.0
```

```bash
git push origin agent-v0.1.0
```

3. The **Agent release** workflow tests the agent, compiles PyInstaller's bootloader from source,
   builds the one-folder app, zips it, publishes SHA-256 hashes and a build-provenance
   attestation, and creates the GitHub Release with notes linking the workflow run.
4. Open the site's **/host** page: the download box now shows the release and GitHub's SHA-256
   for the zip.

Anyone can check a download came from this repository's workflow:

```bash
gh attestation verify reignroom-agent-0.1.0-windows-x64.zip --repo <you>/reignroom
```

## 8. Required tests before calling it done

1. **Two networks** on the deployed site: docs/testing-across-networks.md (broadband host,
   mobile-hotspot guest). Note direct vs relayed route, fps, round trips.
2. **Real game**: docs/real-game-test.md, with your own disc and BIOS and the released agent.

## Custom domain (optional)

If your domain is on Cloudflare: dashboard → your Worker → Settings → Domains & Routes → add a
custom domain. Then:

- The site works on both addresses, but each agent build accepts only one: set
  `REIGNROOM_SITE_ORIGIN` to the domain you'll share and release a new agent version.
- To have one address only, turn off the `workers.dev` route in the same settings.

## Updating

- Site/rooms: commit, then repeat step 5.
- Agent: bump `__version__` in `agent/reignroom_agent/__init__.py`, commit, tag `agent-vX.Y.Z`,
  push the tag.
