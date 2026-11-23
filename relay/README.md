# NBL-Intelligence AI relay

Gives the public website live NVIDIA reasoning without putting the API key in the web page.

Website (GitHub Pages) → this relay (Cloudflare Worker, free plan) → NVIDIA API catalog.

- The NVIDIA key lives only in Cloudflare as a secret.
- Visitors must type the team passcode once; without it the website shows prepared answers only.
- Only the two NBL-Intelligence models are allowed, replies are capped at 4,000 tokens, and each visitor is limited to 20 questions per minute.

Setup steps are in the user guide, chapter "Turning on AI in the website", and in `docs/website-ai.md`.
