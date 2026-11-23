"""Capture NBL-Intelligence screens for the user guide, with panel positions for callouts."""
import asyncio, json, sys
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:8780"
W = 1600
OUT = "/home/claude/guide/img"
BOXES = {}

PANELS_JS = """() => {
  const sel = ['.rail', '.site-switch', '.command', '.chip.stage', '.chip.ai', '.rail-status', '.hero', '.intel-hero', '.ask-panel', '.suggest', '.qa-card', '.brand-band', '.side-card',
               '.grid.g4', '.grid.g5', 'section.card', '.footband', '.thread', '.q-bubble', '.trace', '.numbers', '.decision',
               '.twin-controls', '.twin-tools', '.twin-overview', '.twin-inspect', '.twin-stats', '.twin-legend', '.twin-coord', '.modal-back .card', '.palette'];
  const out = [];
  for (const s of sel) document.querySelectorAll(s).forEach((el, i) => {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return;
    const st = getComputedStyle(el); if (st.display === 'none' || st.visibility === 'hidden') return;
    const h = el.querySelector(':scope > .card-h h3'); 
    out.push({ sel: s, i, title: h ? h.innerText.trim().split('\\n')[0] : (el.innerText || '').trim().split('\\n')[0].slice(0, 60), x: r.x, y: r.y, w: r.width, h: r.height });
  });
  return out;
}"""

async def shot(pg, name, full=True):
    if full:
        h = await pg.evaluate("() => { const m = document.querySelector('.main'); return Math.max(945, m ? m.scrollHeight : 945); }")
        h = min(h, 3600)
        await pg.set_viewport_size({"width": W, "height": int(h)})
        await pg.wait_for_timeout(900)
    vp = pg.viewport_size
    await pg.screenshot(path=f"{OUT}/{name}.png")
    BOXES[name] = {"w": vp["width"], "h": vp["height"], "panels": await pg.evaluate(PANELS_JS)}
    await pg.set_viewport_size({"width": W, "height": 900})
    print("shot", name, vp)

async def goto(pg, page, wait=2500):
    await pg.goto(f"{URL}/#/{page}"); await pg.wait_for_timeout(wait)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": W, "height": 900}, device_scale_factor=2)
        pg = await ctx.new_page()
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        await shot(pg, "welcome", full=False)
        for name in ("Start", "Get started", "Explore", "Close"):
            try: await pg.get_by_role("button", name=name).first.click(timeout=700); break
            except Exception: pass
        await pg.wait_for_timeout(800)
        await shot(pg, "intelligence", full=False)
        # palette
        await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(500)
        await pg.keyboard.type("rech"); await pg.wait_for_timeout(300)
        await shot(pg, "palette", full=False)
        await pg.keyboard.press("Escape"); await pg.mouse.click(5, 5); await pg.wait_for_timeout(300)
        # an answer
        await goto(pg, "intelligence", 1500)
        await pg.locator(".suggest button").nth(1).click()
        await pg.wait_for_timeout(6000)
        await shot(pg, "answer")
        for page in ("explore", "plan", "recharge", "scenarios", "integrity", "decisions", "reports", "settings"):
            await goto(pg, page, 3500); await shot(pg, page)
        await goto(pg, "knowledge", 2500)
        await pg.locator(".card input, input").first.fill("transformer noise")
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(2500)
        await shot(pg, "knowledge")
        # scenarios: compare two runs
        await goto(pg, "scenarios", 3000)
        cards = pg.locator("section.card").first.locator("div[style*='cursor: pointer']")
        if await cards.count() > 1: await cards.nth(1).click(); await pg.wait_for_timeout(2500)
        await shot(pg, "scenarios_compare")
        # twin
        await pg.set_viewport_size({"width": W, "height": 900})
        await goto(pg, "twin", 7000); await shot(pg, "twin_solid", full=False)
        c = pg.locator(".twin-controls")
        await c.get_by_role("button", name="E-W", exact=True).click(); await pg.wait_for_timeout(3500)
        await shot(pg, "twin_cut", full=False)
        await c.get_by_role("button", name="None", exact=True).click()
        await c.get_by_role("button", name="Shells", exact=True).click(); await pg.wait_for_timeout(3500)
        await shot(pg, "twin_shells", full=False)
        await c.get_by_role("button", name="Cells", exact=True).click(); await pg.wait_for_timeout(3500)
        await shot(pg, "twin_cells", full=False)
        await c.get_by_role("button", name="Solid", exact=True).click()
        await c.locator("label.toggle", has_text="Probability of permeable rock").locator("input").uncheck()
        await c.locator("label.toggle", has_text="ADMT response cells").locator("input").check(); await pg.wait_for_timeout(3500)
        await shot(pg, "twin_admt", full=False)
        await c.locator("label.toggle", has_text="ADMT response cells").locator("input").uncheck()
        await c.get_by_role("button", name="Plan", exact=True).click(); await pg.wait_for_timeout(3000)
        # click a drilling-site label
        try:
            await pg.locator(".label3d.site").first.click(timeout=2000); await pg.wait_for_timeout(1200)
        except Exception as e: print("label click failed", e)
        await pg.mouse.move(800, 480); await pg.wait_for_timeout(800)
        await shot(pg, "twin_plan", full=False)
        json.dump(BOXES, open(f"{OUT}/boxes.json", "w"), indent=1)
        await b.close()

asyncio.run(main())
