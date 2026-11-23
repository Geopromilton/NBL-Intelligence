# Turning on AI in the website

The website (GitHub Pages) cannot hold the NVIDIA key, and NVIDIA does not accept calls made directly from web pages. A small relay on Cloudflare (free plan) sits between them:

Website → NBL relay (holds the key, checks the team passcode) → NVIDIA

One-time setup, about 15 minutes:

1. **Cloudflare account.** Sign up free at https://dash.cloudflare.com/sign-up. Open **Workers & Pages** once; Cloudflare asks you to choose a `workers.dev` subdomain (for example `nbl`). Note it.
2. **Account ID.** In Cloudflare, Workers & Pages → the right-hand panel shows **Account ID**. Copy it.
3. **API token.** Cloudflare → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** → Continue → Create Token. Copy it (it is shown once).
4. **GitHub secrets.** Repository → Settings → Secrets and variables → Actions → **New repository secret**, four times:
   - `CLOUDFLARE_API_TOKEN`: the token from step 3
   - `CLOUDFLARE_ACCOUNT_ID`: the ID from step 2
   - `NVIDIA_API_KEY`: your NVIDIA key (`nvapi-…`)
   - `AI_PASSCODE`: a passcode you choose for the team
5. **Deploy the relay.** Repository → Actions → **AI relay** → Run workflow. When it is green, the relay is at `https://nbl-intelligence-relay.<subdomain>.workers.dev`. Open `…/health` in a browser: it should say `"key_set":true,"passcode_set":true`.
6. **Tell the website** (only if the address differs from `https://nbl-intelligence-relay.geopromilton.workers.dev`, which is built in). Settings → Secrets and variables → Actions → **Variables** tab → New variable `AI_RELAY_URL` = the relay address from step 5.
7. **Rebuild the website.** Actions → **Website** → Run workflow.
8. **Use it.** Open the website → **Unlock AI** (top right) → type the passcode. That browser remembers it.

Notes
- The key never appears in the website or the repository. Only the four secrets hold sensitive values.
- To change the passcode: update the `AI_PASSCODE` secret and run **AI relay** again. Everyone then unlocks with the new one.
- Questions use your NVIDIA account. The relay allows only the two NBL-Intelligence models, caps each reply at 4,000 tokens and limits each visitor to 20 questions per minute.
- On the website the AI uses the published snapshot: site facts, drilling sites, zones, recharge, MODFLOW results, assumptions, rainfall, integrity, decisions, and the prepared water plans (2–6 persons per flat × dry, expected, wet). Project documents are not published, so document search stays in the Windows app.
