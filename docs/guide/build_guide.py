"""Build the NBL-Intelligence user guide (HTML -> PDF with headless Chrome)."""
import base64, io, json, subprocess
from datetime import date
from pathlib import Path
from PIL import Image

G = Path("/home/claude/guide")
IMG = G / "img"
BOX = json.loads((IMG / "boxes.json").read_text())
BRAND = Path("/home/claude/nbl-intelligence/assets/brand")
FIGN = [0]


def data_uri(path: Path, width=2400, quality=84) -> str:
    im = Image.open(path).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def png_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def find(shot, sel, key=0):
    for p in BOX[shot]["panels"]:
        if p["sel"] == sel and (p["i"] == key if isinstance(key, int) else p["title"].lower().startswith(key.lower())):
            return p
    raise KeyError((shot, sel, key))


def fig(shot, caption, marks=(), crop=None, width="100%", img_name=None):
    """A screenshot with numbered callouts. marks: (n, selector, index-or-title[, dx, dy])."""
    FIGN[0] += 1
    W, H = BOX[shot]["w"], BOX[shot]["h"] if shot in BOX else (1600, 900)
    x0, y0, x1, y1 = crop or (0, 0, W, H)
    im = Image.open(IMG / f"{img_name or shot}.png")
    sx = im.width / BOX[shot]["w"]
    if crop:
        im = im.crop((int(x0 * sx), int(y0 * sx), int(x1 * sx), int(y1 * sx)))
    tmp = G / "tmp.png"; im.save(tmp)
    cw, ch = x1 - x0, y1 - y0
    out = [f'<figure style="width:{width}"><div class="shot"><img src="{data_uri(tmp)}">']
    for m in marks:
        n, sel, key = m[:3]
        p = find(shot, sel, key)
        L = (p["x"] - x0) / cw * 100; T = (p["y"] - y0) / ch * 100
        Wd = p["w"] / cw * 100; Hd = p["h"] / ch * 100
        out.append(f'<span class="box" style="left:{L:.2f}%;top:{T:.2f}%;width:{Wd:.2f}%;height:{Hd:.2f}%"></span>')
        out.append(f'<span class="mark" style="left:{max(0.4, L + 0.3):.2f}%;top:{max(0.6, T + 0.6):.2f}%">{n}</span>')
    out.append(f'</div><figcaption><b>Figure {FIGN[0]}.</b> {caption}</figcaption></figure>')
    return "".join(out)


def plain_fig(path, caption, width="100%"):
    FIGN[0] += 1
    return f'<figure style="width:{width}"><div class="shot"><img src="{data_uri(path)}"></div><figcaption><b>Figure {FIGN[0]}.</b> {caption}</figcaption></figure>'


def keys(rows):
    """Numbered key for callouts: rows of (n, name, text)."""
    return '<table class="key">' + "".join(f'<tr><td class="kn"><span class="mk">{n}</span></td><td class="kt"><b>{a}</b> {b}</td></tr>' for n, a, b in rows) + "</table>"


def steps(items):
    return '<ol class="steps">' + "".join(f"<li>{s}</li>" for s in items) + "</ol>"


def tip(text, kind="tip"):
    label = {"tip": "Tip", "note": "Note", "care": "Take care"}[kind]
    return f'<div class="callout {kind}"><b>{label}.</b> {text}</div>'


def table(head, rows, cls=""):
    h = "".join(f"<th>{x}</th>" for x in head)
    b = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<table class="data {cls}"><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table>'


# ------------------------------------------------------------------ diagrams (SVG)
FLOW = """<svg viewBox="0 0 860 300" class="diagram" xmlns="http://www.w3.org/2000/svg" font-family="Times New Roman, Liberation Serif, serif">
<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#1F3864"/></marker></defs>
<rect x="10" y="95" width="160" height="110" rx="12" fill="#EEF4FA" stroke="#1F3864"/>
<text x="90" y="125" text-anchor="middle" font-size="16" font-weight="bold" fill="#1F3864">Site data</text>
<text x="90" y="148" text-anchor="middle" font-size="13">ADMT survey, maps,</text><text x="90" y="166" text-anchor="middle" font-size="13">rainfall, masterplan,</text><text x="90" y="184" text-anchor="middle" font-size="13">borewell records</text>
<rect x="230" y="25" width="190" height="105" rx="12" fill="#E6F4EA" stroke="#2E7D32"/>
<text x="325" y="55" text-anchor="middle" font-size="16" font-weight="bold" fill="#2E7D32">NBL-AquaTwin</text>
<text x="325" y="78" text-anchor="middle" font-size="13">groundwater engine:</text><text x="325" y="96" text-anchor="middle" font-size="13">3D model, drilling sites,</text><text x="325" y="114" text-anchor="middle" font-size="13">recharge, MODFLOW</text>
<rect x="230" y="170" width="190" height="105" rx="12" fill="#E3F2FD" stroke="#1565C0"/>
<text x="325" y="200" text-anchor="middle" font-size="16" font-weight="bold" fill="#1565C0">NBL-WaterPlan</text>
<text x="325" y="223" text-anchor="middle" font-size="13">water-balance engine:</text><text x="325" y="241" text-anchor="middle" font-size="13">demand, rain, storage,</text><text x="325" y="259" text-anchor="middle" font-size="13">treatment, tanker</text>
<rect x="480" y="80" width="200" height="140" rx="14" fill="#1F3864"/>
<text x="580" y="115" text-anchor="middle" font-size="17" font-weight="bold" fill="#fff">NBL-Intelligence</text>
<text x="580" y="140" text-anchor="middle" font-size="13" fill="#DDE7F3">reads both engines,</text><text x="580" y="158" text-anchor="middle" font-size="13" fill="#DDE7F3">checks they agree,</text><text x="580" y="176" text-anchor="middle" font-size="13" fill="#DDE7F3">shows 3D and charts,</text><text x="580" y="194" text-anchor="middle" font-size="13" fill="#DDE7F3">AI explains with sources</text>
<rect x="730" y="105" width="120" height="90" rx="12" fill="#FFF4E5" stroke="#E07B00"/>
<text x="790" y="137" text-anchor="middle" font-size="16" font-weight="bold" fill="#E07B00">You</text>
<text x="790" y="158" text-anchor="middle" font-size="13">decide, approve,</text><text x="790" y="176" text-anchor="middle" font-size="13">report</text>
<path d="M170 135 L228 85" stroke="#1F3864" stroke-width="2" marker-end="url(#ar)" fill="none"/>
<path d="M170 165 L228 215" stroke="#1F3864" stroke-width="2" marker-end="url(#ar)" fill="none"/>
<path d="M420 80 L478 125" stroke="#1F3864" stroke-width="2" marker-end="url(#ar)" fill="none"/>
<path d="M420 222 L478 178" stroke="#1F3864" stroke-width="2" marker-end="url(#ar)" fill="none"/>
<path d="M680 150 L728 150" stroke="#1F3864" stroke-width="2" marker-end="url(#ar)" fill="none"/>
</svg>"""

CYCLE = """<svg viewBox="0 0 860 170" class="diagram" xmlns="http://www.w3.org/2000/svg" font-family="Times New Roman, Liberation Serif, serif">
<defs><marker id="a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#1F3864"/></marker></defs>
""" + "".join(
    f'<rect x="{10 + i * 215}" y="30" width="180" height="100" rx="14" fill="{c}" stroke="#1F3864"/>'
    f'<text x="{100 + i * 215}" y="62" text-anchor="middle" font-size="13" fill="#1F3864">{s}</text>'
    f'<text x="{100 + i * 215}" y="86" text-anchor="middle" font-size="17" font-weight="bold" fill="#1F3864">{t}</text>'
    f'<text x="{100 + i * 215}" y="110" text-anchor="middle" font-size="13">{d}</text>'
    + (f'<path d="M{190 + i * 215} 80 L{223 + i * 215} 80" stroke="#1F3864" stroke-width="2" marker-end="url(#a2)"/>' if i < 3 else "")
    for i, (s, t, d, c) in enumerate([("Step 1", "Explore", "find the groundwater", "#E6F4EA"), ("Step 2", "Water plan", "use and reuse it", "#E3F2FD"),
                                       ("Step 3", "Recharge", "give it back", "#E0F7F4"), ("Step 4", "Decide", "compare, check, record", "#FFF4E5")])) + "</svg>"

# ------------------------------------------------------------------ content
today = date.today().strftime("%d %B %Y")
logo = png_uri(BRAND / "logo-horizontal-dark.png")
mark = png_uri(BRAND / "mark-512.png")

H = []
H.append(f"""
<section class="cover">
  <img class="cover-logo" src="{logo}">
  <div class="cover-band">
    <div class="cover-kicker">User guide</div>
    <h1 class="cover-title">NBL-Intelligence</h1>
    <div class="cover-sub">Water intelligence for Nature Based Living sites<br>Windows app and website · version 1.2</div>
  </div>
  <img class="cover-shot" src="{data_uri(IMG / 'twin_cut.png', 1800)}">
  <div class="cover-foot">Vijayanagar Eco-Village Pvt Ltd · Nature Based Living<br>First site: Siddanahalli, Malur Taluk, Kolar District · {today}</div>
</section>
""")

H.append("""
<section class="toc"><h1 class="nonum">Contents</h1>
<ol class="toc-list">
<li>How to use this guide</li><li>What NBL-Intelligence is</li><li>Words you will meet</li><li>Install, first start and updates</li>
<li>The main screen</li><li>Intelligence: asking questions</li><li>Site twin: the 3D model</li><li>Explore: where to drill</li>
<li>Water plan: the daily water balance</li><li>Recharge: giving water back to the ground</li><li>Scenarios: comparing plans</li>
<li>Integrity: do the numbers agree?</li><li>Decisions: the decision log</li><li>Knowledge: searching the project documents</li>
<li>Reports: the Word report</li><li>Settings: AI key, folders and updates</li><li>The website and website AI</li>
<li>Everyday tasks, step by step</li><li>Problems and answers</li><li>Quick reference</li>
</ol></section>
""")

# 1
H.append(f"""
<h1>How to use this guide</h1>
<p>This guide is written for someone who has never used NBL-Intelligence and has no background in groundwater. Read chapters 2 to 5 once, in order. After that, use the chapter for the page you are working on.</p>
<p>Conventions used throughout:</p>
<ul>
<li><b>Bold words</b> are things you see on the screen: a page name, a button or a box. For example: click <b>Run and save this plan</b>.</li>
<li>Orange numbers on a picture, like <span class="mk">1</span>, match the numbered list under the picture.</li>
<li>“Click” means one click with the left mouse button. “Drag” means hold the left button down and move the mouse.</li>
<li>Arrows show a path through the screens: <b>Settings → NVIDIA reasoning → Save</b>.</li>
</ul>
{tip("Every number in NBL-Intelligence carries a small label saying where it came from and what period it covers. Chapter 3 explains these labels. Reading them is the most important skill in this guide.")}
""")

# 2
H.append(f"""
<h1>What NBL-Intelligence is</h1>
<p>NBL-Intelligence is the single place where Nature Based Living looks at the water of a site. It answers three practical questions:</p>
<ul><li><b>Is there groundwater, and where should we drill?</b></li><li><b>Will the water supply work for the people who will live here, in wet and dry years?</b></li><li><b>How do we put rainwater back into the ground?</b></li></ul>
<p>It does not do the heavy calculations itself. Two separate programs, called <b>engines</b>, do that. NBL-Intelligence reads their results, checks they agree, shows them as maps, a 3D model and charts, and lets an AI model explain them in plain words, always with the source of every number.</p>
<div class="diagram-box">{FLOW}<div class="dcap"><b>Figure A.</b> How the parts fit together. The two engines stay separate; NBL-Intelligence sits on top of them.</div></div>
<h2>The two engines</h2>
{table(["Engine", "What it does", "Where it is"], [
 ["<b>NBL-AquaTwin</b>", "Interprets the ADMT ground survey into a 3D picture of the rock below the site, ranks drilling sites, finds recharge points and runs MODFLOW groundwater models.", "D:\\NBL-AquaTwin"],
 ["<b>NBL-WaterPlan</b>", "Runs a day-by-day water balance for many years: how much water people use, how much rain is caught, stored, treated and reused, and what must leave by tanker.", "D:\\NBL-WaterPlan"]])}
<h2>The water cycle in four steps</h2>
<p>The left-hand menu follows the life of the water on the site:</p>
<div class="diagram-box">{CYCLE}<div class="dcap"><b>Figure B.</b> The pages follow the water: find it, use and reuse it, give it back, then decide.</div></div>
<h2>Two ways to open it</h2>
{table(["", "Windows app", "Website"], [
 ["What it is", "Installed program on your computer", "Read-only copy at geopromilton.github.io/NBL-Intelligence"],
 ["Runs the engines", "Yes, live", "No, it shows a published snapshot"],
 ["AI questions", "Yes, with your NVIDIA key", "Yes for the team, after typing the passcode (chapter 17)"],
 ["Save runs, decisions, reports", "Yes", "No"],
 ["Updates", "Inside the app, no reinstall", "Automatic when the snapshot is republished"]])}
{tip("The site is at <b>Stage A</b>: no borehole has been drilled on the site yet. Everything about groundwater is a scenario until the first borehole is logged and pump-tested. NBL-Intelligence shows this warning on every groundwater result.", "care")}
""")

# 3
GLOSS = [
 ["ADMT survey", "A ground survey that measures natural electrical signals to guess where water-bearing rock lies. It was done on 14 lines across the site in October 2026."],
 ["Aquifer", "Rock or soil underground that holds water and lets it flow to a well."],
 ["Borewell / borehole", "A deep, narrow well drilled into rock. On-site boreholes will test the ADMT scenarios."],
 ["Drilling site A–G", "Places ranked for the first boreholes. A is priority 1, B priority 2, C the reserve."],
 ["Zone (Z01, Z02 …)", "A part of the survey where the signal suggests water-bearing rock, scored 0–10."],
 ["Permeable rock", "Rock with cracks or pores that water can pass through. The 3D model shows the probability (chance, 0 to 1) that rock is permeable."],
 ["Reading: positive, neutral, negative", "Three ways of reading the same survey. They are kept side by side until a borehole shows which is right."],
 ["Recharge", "Putting water back into the ground, for example roof water led into recharge shafts or wells."],
 ["Recharge point (RZ-1 …)", "Places chosen for recharge structures, from the survey and the model."],
 ["Depth tier", "A depth band used for recharge: shallow 0–20 m, medium 20–60 m, medium-to-deep 60–175 m, deeper 175–250 m."],
 ["MODFLOW", "A standard groundwater computer model. AquaTwin uses it to test recharge and pumping over 10 years."],
 ["Cloudburst / design storm", "One very heavy rain day used to test recharge (115 mm in one day here)."],
 ["Water balance", "Day-by-day bookkeeping of all water coming in, stored, used, treated, reused and leaving."],
 ["Persons per flat", "How many people live in one flat. You can set 2 to 6. The design value is 4. The site has 141 flats."],
 ["Rain case: dry, expected, wet", "Dry is a dry decade, expected is a typical decade, wet a wet decade, drawn from the IMD rainfall record 1901–2025."],
 ["Net zero discharge", "No water leaves the lease as overflow or waste water. Only RO concentrate and sludge leave, by tanker."],
 ["RO, RO recovery", "Reverse osmosis water treatment. Recovery is the share of water that comes out clean (75 % means 75 L clean from 100 L)."],
 ["RO concentrate", "The salty water left over after RO. It leaves the site by tanker."],
 ["Reliability", "Share of days on which every flat gets all the water it needs."],
 ["Placeholder", "A value used only until a field test measures the real one, for example borewell yield until the pumping test."],
 ["Stage A", "Evidence stage before any on-site borehole. Groundwater results are untested scenarios."],
 ["Run, fingerprint", "A saved calculation. Its fingerprint (SHA-256) is a code that proves the inputs and results have not changed."],
 ["m³, m³/day, mm/yr", "Cubic metres (1 m³ = 1,000 litres); per day; millimetres of rain per year."],
]
H.append(f"""
<h1>Words you will meet</h1>
<p>Keep this page at hand. Each word is used on the screens exactly as written here.</p>
{table(["Word", "Meaning in plain words"], GLOSS, "gloss")}
<h2>How to read a number</h2>
<p>Every number shows three things: <b>where it came from</b>, <b>what period</b> it covers, and <b>which case</b> it belongs to.</p>
{table(["Label you see", "What it means"], [
 ["<span class='pv m'>Measured</span>", "Measured on the site."],
 ["<span class='pv i'>Imported</span>", "Taken from a document or an agency record (for example IMD rainfall)."],
 ["<span class='pv c'>Calculated</span>", "Calculated by an engine from other values."],
 ["<span class='pv f'>Forecast</span>", "Expected for a future period."],
 ["<span class='pv a'>Assumption</span>", "A planning assumption you can change (for example 4 persons per flat)."],
 ["<span class='pv p'>Placeholder</span>", "Used until a field test replaces it."],
 ["<span class='pv ai'>AI interpretation</span>", "Written by the AI. It explains; it never calculates."]])}
<p><b>Period</b> tells you the time span: <i>per day</i>, <i>per year</i>, <i>over 10 years</i> or <i>single event</i>. <b>Case</b> tells you the situation: <i>expected</i> (average), <i>dry</i>, <i>wet</i>, <i>peak</i> or <i>design</i>. For water, the label also says <i>before</i> or <i>after treatment</i> where it matters.</p>
{tip("Two numbers can only be compared when they have the same period and case. “71 m³/day, per day averaged, expected rain” and “103 m³/day, dry decade, 6 persons per flat” describe different situations.")}
""")

# 4
H.append(f"""
<h1>Install, first start and updates</h1>
<h2>Install the Windows app (once)</h2>
{steps([
 "Open <b>github.com/Geopromilton/NBL-Intelligence/releases</b> in your browser.",
 "Under the newest version, click <b>NBL-Intelligence_Setup_1.2.0.exe</b> to download it (about 100 MB).",
 "Double-click the downloaded file. If Windows shows <b>Windows protected your PC</b>, click <b>More info</b>, then <b>Run anyway</b>. This happens because the installer is new to Windows, not because something is wrong.",
 "Click <b>Next</b> through the steps and <b>Install</b>. No administrator password is needed; it installs only for you.",
 "Tick <b>Launch NBL-Intelligence</b> and click <b>Finish</b>. A desktop shortcut and a Start-menu entry are added."])}
<p>The app opens in its own window. It needs the two engine folders, <b>D:\\NBL-AquaTwin</b> and <b>D:\\NBL-WaterPlan</b>, and the site folder <b>D:\\Siddanahalli</b>. If they are somewhere else, set them in Settings (chapter 16).</p>
<h2>First start</h2>
{fig("welcome", "The welcome window shown the first time the app opens.", [])}
<p>The welcome window lists three things: add the NVIDIA key (so the AI can reason), check the engines are found, and ask a first question. Click <b>Start</b> to begin, or <b>Open Settings</b> to add the key now. Without a key everything still works; the AI part answers in a simpler “offline” way straight from the engines.</p>
<h2>Getting updates without reinstalling</h2>
{steps([
 "Open <b>Settings</b> (bottom of the left menu).",
 "In the <b>Updates</b> box click <b>Check for updates</b>. The app also checks by itself each time it starts, and a small banner appears when a new version is out.",
 "Click <b>Download and install</b>. Only the program is replaced. Your sites, runs, decisions, reports and settings are never touched.",
 "Click <b>Restart now</b>. The new version opens.",
 "If anything looks wrong after an update, click <b>Roll back to the previous version</b>."])}
""")

# 5
H.append(f"""
<h1>The main screen</h1>
<p>Every page shares the same frame: a menu on the left, a bar across the top, and the page itself in the middle.</p>
{fig("intelligence", "The main screen, with the Intelligence page open.", [
 (1, ".rail", 0), (2, ".site-switch", 0), (3, ".command", 0), (4, ".chip.stage", 0), (5, ".chip.ai", 0), (6, ".rail-status", 0)])}
{keys([
 (1, "Left menu.", "The pages, grouped as Ask, Site, Water cycle, Decide, Library and System. Click a name to open it. A red number (on Integrity) counts open problems."),
 (2, "Site switch.", "Shows the site you are looking at. When more sites are added (for example Denkanikottai), choose them here; every page then shows that site."),
 (3, "Search and ask bar.", "Click it or press <b>Ctrl + K</b>. Type a page name to jump there, or type a question and press Enter to ask the AI."),
 (4, "Stage chip.", "Reminds you the site is at Stage A, before drilling. Hover over it for the full status."),
 (5, "AI chip.", "Says whether AI reasoning is on. If it says <b>Add NVIDIA key</b>, click it to go to Settings."),
 (6, "Status card.", "Shows which AI model is answering, or “AI offline” when there is no key.")])}
{fig("palette", "Ctrl + K opens the quick search. Typing “rech” offers the Recharge page, or to ask the question as typed.", [(1, ".palette", 0)])}
{tip("Use the arrow keys to move in the quick search and Enter to choose. Press Esc to close it.")}
""")

# 6 Intelligence
H.append(f"""
<h1>Intelligence: asking questions</h1>
<p>This is the home page. You ask a question in normal English; NBL-Intelligence decides which engine results it needs, reads them, and writes an answer in which every number is labelled and sourced.</p>
{fig("intelligence", "The Intelligence page before a question is asked.", [
 (1, ".ask-panel", 0), (2, ".suggest", 0), (3, ".grid.g5", 0), (4, ".side-card", 0), (5, ".side-card", 1), (6, ".side-card", 2), (7, ".brand-band", 0)])}
{keys([
 (1, "Ask box.", "Type your question and press Enter or click <b>Ask</b>."),
 (2, "Suggested questions.", "One click asks a ready-made question. <b>More</b> shows extra suggestions."),
 (3, "Quick access.", "Picture cards that open the main pages."),
 (4, "Site pulse.", "Key site facts: lease area, flats, persons per flat, reservoir, rain normal, stage of groundwater development."),
 (5, "Integrity.", "How many of the cross-checks agree. Click <b>Open</b> to see the differences."),
 (6, "Conversations.", "Your earlier questions. Click one to read it again."),
 (7, "NBL principles.", "The four aims behind every plan: conserve water, restore nature, build resilience, close the loop.")])}
<h2>Reading an answer</h2>
{fig("answer", "An answer to “Where should we drill the first borewell, and why there?”. This copy had no NVIDIA key, so it shows the offline answer taken straight from the engine.", [
 (1, ".q-bubble", 0), (2, ".trace", 0), (3, ".thread", 0)], crop=(236, 560, 1240, 1600))}
{keys([
 (1, "Your question.", ""),
 (2, "Engine steps.", "Each chip is one engine result the answer used, for example <i>AquaTwin · drilling sites</i>. They appear as the AI works."),
 (3, "The answer.", "Written word by word as it arrives. Under it you may see: <b>number cards</b> (each with unit, period, case and a provenance label), <b>Evidence</b> (the source files), <b>What would change this answer</b> (the field test that would change it), a <b>suggested decision</b> you can approve or ignore, and the AI's <b>confidence</b>.")])}
<h2>Asking good questions</h2>
<ul>
<li>Say the case: “in a <b>dry</b> decade”, “with <b>6</b> persons per flat”, “at full occupancy”.</li>
<li>Ask one thing at a time, then follow up: “And with 5 persons?”. The AI remembers the conversation.</li>
<li>Ask for comparisons: “Compare sites A, B and C for the first borehole.”</li>
<li>Ask what is missing: “What field tests would most reduce uncertainty?”</li></ul>
{tip("The AI never invents numbers. If no engine gives a number, it says what is missing. It also never calls any supply “low-grade”: every source is filtered or RO-treated to one standard.", "note")}
""")

# 7 Twin
H.append(f"""
<h1>Site twin: the 3D model</h1>
<p>The site twin is a 3D model of the site: the ground surface, the lease boundary, the drilling sites, the reference borewells, the recharge points and, below the ground, the model of permeable rock built from the ADMT survey.</p>
{fig("twin_solid", "The site twin. Below the ground is the solid model of permeable rock (positive reading, threshold 0.30).", [
 (1, ".twin-controls", 0), (2, ".twin-legend", 0), (3, ".twin-overview", 0), (4, ".twin-tools", 0), (5, ".twin-stats", 0)])}
{keys([
 (1, "Layer panel.", "View buttons (<b>3D</b>, <b>Plan</b>, <b>Section</b>), the permeable rock model, surface layers, ADMT layers and display sliders. Scroll inside the panel to see all of it."),
 (2, "Colour key.", "What the colours mean for the layer shown."),
 (3, "Site overview.", "Lease area, ground level along the boundary, centre coordinates, grid, model size and status."),
 (4, "Tools.", "<b>+</b> and <b>−</b> zoom, the circular arrow resets the view, the pin gives a plan view, the layers button hides or shows the layer panel."),
 (5, "Numbers.", "Ground level, number of drilling sites, number of recharge points, and the volume of rock at or above the chosen probability. This is a rock volume, not a volume of water.")])}
<h2>Moving around</h2>
{table(["To do this", "Do this with the mouse"], [["Turn the model", "Drag with the left button"], ["Move sideways", "Drag with the right button"], ["Zoom in or out", "Turn the mouse wheel, or use + and −"], ["Read a place", "Point at the ground: the bottom-right box shows latitude, longitude, UTM and ground level"], ["Learn about an item", "Click a drilling-site pin, a borewell, a recharge ring or its label"]])}
<h2>The permeable rock model</h2>
<p>The survey gives, for every small block of rock below the site, a probability between 0 and 1 that the rock is permeable. NBL-Intelligence turns these blocks into a smooth solid body, as geological programs such as GMS or RockWorks do.</p>
{table(["Setting", "What it does"], [
 ["<b>Solid</b>", "One closed body wherever the probability is at or above the threshold. Its colour shows the strongest probability inside: blue near the threshold, then cyan, green and yellow for the highest."],
 ["<b>Shells</b>", "Three see-through surfaces nested inside each other, like the layers of an onion, at three probability levels."],
 ["<b>Cells</b>", "The original model blocks, 10 m by 10 m. Use it to check the solid against the raw data."],
 ["<b>Reading</b>", "Positive, neutral or negative way of reading the survey. The negative reading has no permeable class, so nothing is drawn for it."],
 ["<b>Threshold</b>", "The smallest probability that counts. Lower it to see more rock, raise it to see only the most likely parts."],
 ["<b>Cutaway</b>", "Cuts the model east–west (E-W) or north–south (N-S) and shows the cut face. Move <b>Section position</b> to slide the cut."],
 ["<b>Depth window</b>", "Shows only the depths between the two sliders (0–600 m)."],
 ["<b>Terrain exaggeration, Depth scale</b>", "Stretch the ground height or squeeze the depth so features are easier to see. They change the picture only, not the data."]])}
<div class="two">
{fig("twin_cut", "Cutaway east–west. On the cut face, grey-brown is rock below the threshold; colours are the permeable body.", [], crop=(560, 130, 1240, 770), width="49%")}
{fig("twin_shells", "Shells: three nested probability surfaces.", [], crop=(560, 130, 1240, 770), width="49%")}
</div>
<div class="two">
{fig("twin_cells", "Cells: the raw model blocks above the threshold.", [], crop=(560, 130, 1240, 770), width="49%")}
{fig("twin_admt", "ADMT response cells: the survey signal itself, purple (very low) to red (high).", [], crop=(560, 130, 1240, 770), width="49%")}
</div>
{fig("twin_plan", "Plan view. Clicking the label of drilling site A opens its details on the right; the box at bottom right shows the position under the mouse.", [(1, ".twin-inspect", 0), (2, ".twin-coord", 0)])}
{tip("Purple in the ADMT colours means very low response (clay-like or salty ground), not water. The water-bearing signal is in the blue shades.", "care")}
""")

# 8 Explore
H.append(f"""
<h1>Explore: where to drill</h1>
<p>Explore shows the result of the ADMT survey as NBL-AquaTwin interprets it: the ranked drilling sites, a plan of the lease, the confidence in each part of the evidence and the reference borewells near the site.</p>
{fig("explore", "The Explore page.", [
 (1, ".grid.g4", 0), (2, "section.card", "Drilling sites"), (3, "section.card", "Lease plan"), (4, "section.card", "Site A"), (5, "section.card", "Confidence panel"), (6, "section.card", "Reference borewells"), (7, ".footband", 0)])}
{keys([
 (1, "Survey summary.", "14 survey lines, 1,000 stations by 60 depth levels, share of survey cells kept after quality checks, and the preliminary drilling depth (350–400 m, an assumption)."),
 (2, "Drilling sites.", "Sites A to G with their role, main zone, score, distance to the boundary and to the transformer. Every site is <b>Unvalidated</b> until the first borehole. Click a row to see it below and on the map."),
 (3, "Lease plan.", "The lease boundary with the sites, the recharge points and the transformer exclusion circle (electrical noise spoils the survey near it)."),
 (4, "Selected site.", "Score, distances, the zone, the reasons and the locked predictions written before drilling, so the borehole can prove them right or wrong."),
 (5, "Confidence panel.", "Each layer of evidence is shown on its own, never merged into one score: data quality, statistics, spatial support, field evidence, assumptions, plausibility, model and surrogate status."),
 (6, "Reference borewells.", "Three borewells outside the site, as reported by drillers and owners. They help cross-check the survey."),
 (7, "Key insight.", "One sentence taken from the data, with a button to ask the AI to explain it.")])}
""")

# 9 Plan
H.append(f"""
<h1>Water plan: the daily water balance</h1>
<p>The water plan asks NBL-WaterPlan to simulate every day for the planning period: people use water, rain fills the roof chambers and reservoir, used water is treated and reused, the borewell tops up, RO concentrate leaves by tanker. The results update as you move the sliders.</p>
{fig("plan", "The Water plan page with the design case: 4 persons per flat, expected rain, 10 years.", [
 (1, ".grid.g5", 0), (2, "section.card", "Scenario inputs"), (3, "section.card", "Where the water"), (4, "section.card", "Storage"), (5, "section.card", "Rain drawn"), (6, "section.card", "Totals"), (7, ".footband", 0)])}
{keys([
 (1, "Headline numbers.", "People at full occupancy, net zero discharge (yes or no), reliability, average demand and the RO concentrate tanker volume, each with its period."),
 (2, "Scenario inputs.", "Rain case (dry, expected, wet) or a fixed annual rain, persons per flat (2–6), flats, water use per person, years to full occupancy, borewell capacity (a placeholder until the pumping test), reservoir size, RO recovery and planning period. <b>Reset</b> returns to the design values."),
 (3, "Where the water comes from.", "Shares of rainwater, treated wastewater reused and borewell water, all after treatment."),
 (4, "Storage.", "How full the reservoir, roof chambers and treated-water tank are through the years."),
 (5, "Rain drawn for this plan.", "The years taken from the IMD rainfall record for this case. Orange bars are drier than the long-term mean."),
 (6, "Totals with labels.", "Every total with its period and provenance label."),
 (7, "Summary band.", "Water security, resource efficiency and net zero status, with <b>Generate report</b>.")])}
<h2>Try it</h2>
{steps(["Click <b>Dry</b> under Rain case.", "Drag <b>Persons per flat</b> to 6.", "Watch the headline numbers: does net zero discharge stay <b>Yes</b>? Is reliability still 100 %?", "Type a name such as “6 persons, dry decade” and click <b>Run and save this plan</b>. The run is now on the Scenarios page."])}
{tip("Borewell capacity is a placeholder (P3) until the pumping test. Treat plans that lean heavily on the borewell with care.", "care")}
""")

# 10 Recharge
H.append(f"""
<h1>Recharge: giving water back to the ground</h1>
<p>Recharge shows how much storm water can be stored underground through recharge structures, and how the aquifer responds over 10 years. The results come from NBL-AquaTwin's MODFLOW runs.</p>
{fig("recharge", "The Recharge page.", [
 (1, ".grid.g5", 0), (2, "section.card", "Cloudburst storage"), (3, "section.card", "Concept"), (4, "section.card", "Recharge zone"), (5, ".footband", 0), (6, "section.card", "Ten-year")])}
{keys([
 (1, "Headline numbers.", "Share of a 115 mm design storm that reaches the aquifer, share still in the model after one year, the design storm, the number of recharge points and the Stage A warning."),
 (2, "Storage by depth tier.", "For each depth tier: share reaching the aquifer, share held in dry rock above the water table, share still in the model after 1 year. <b>Open boundary</b> and <b>Closed</b> are two ways of treating the model edge."),
 (3, "Concept picture.", "How water moves down through the four tiers. An illustration, not to scale."),
 (4, "Recharge points.", "The RZ points on the lease plan and in a table with their tiers, readings and the nearest zone."),
 (5, "Key result.", "All tiers together, in one sentence."),
 (6, "Ten-year response.", "MODFLOW scenarios S6 (pumping only) and S1 to S5 (recharge measures): water recharged, pumping avoided, drawdown at the well (low, middle and high estimates).")])}
{tip("These MODFLOW runs used an earlier, smaller population and roof area. Check the Integrity page before quoting recharge volumes for design.", "care")}
""")

# 11 Scenarios
H.append(f"""
<h1>Scenarios: comparing plans</h1>
<p>Every water plan you save becomes a <b>run</b> with a fingerprint. On Scenarios you compare runs side by side and approve or reject them.</p>
{fig("scenarios_compare", "Two saved runs compared: the design case and a stress case (6 persons per flat, dry decade).", [
 (1, "section.card", "Saved runs"), (2, "section.card", "Water balance"), (3, ".grid.g5", 0), (4, "section.card", "Comparison"), (5, "section.card", "Reservoir")])}
{keys([
 (1, "Saved runs.", "Click a run to add it to the comparison (up to four). Its badge shows Pending, Approved or Rejected."),
 (2, "Water balance.", "Ring chart of where the water came from in the first selected run."),
 (3, "Headline numbers.", "For the first selected run."),
 (4, "Comparison.", "Each item side by side, with period labels. <b>Approve</b> or <b>Reject</b> records your review. The fingerprint proves the run has not changed."),
 (5, "Reservoir storage.", "The storage of each run through time, one colour per run.")])}
""")

# 12 Integrity
H.append(f"""
<h1>Integrity: do the numbers agree?</h1>
<p>The site registry, NBL-AquaTwin and NBL-WaterPlan each hold some of the same site numbers. Integrity checks whether they agree. Nothing is changed automatically: each difference comes with the action to take.</p>
{fig("integrity", "The Integrity page.", [(1, ".grid.g4", 0), (2, "section.card", "Lease area"), (3, "section.card", "People assumed")], crop=(236, 0, 1600, 1000))}
{keys([
 (1, "Counts.", "How many checks agree, differ, or are only notes (different basis, not a conflict)."),
 (2, "One check per row.", "A picture, the name and status, the value from each source side by side, and the <b>Action</b> to take. Rows with a yellow edge differ."),
 (3, "Example of a difference.", "The groundwater model used 96 residents while the water plan uses 564 people at full occupancy. The action says which model must be re-run.")])}
{steps(["Read the action of each yellow row.", "Fix the source (for example re-run the AquaTwin model with the new numbers) or record why the difference is acceptable.", "Click <b>Record a decision</b> to write that choice in the decision log.", "Click <b>Re-check</b> to run the checks again."])}
""")

# 13 Decisions
H.append(f"""
<h1>Decisions: the decision log</h1>
<p>One log for every decision about the site: those made in NBL-Intelligence (numbered NBI-D-…) and the NBL-AquaTwin log (D-…, read-only here). AI suggestions enter the log only when you approve them.</p>
{fig("decisions", "The Decisions page.", [(1, ".grid.g4", 0), (2, "section.card", "Decision log"), (3, "section.card", "Record"), (4, "section.card", "Open actions")], crop=(236, 0, 1600, 1100))}
{keys([
 (1, "Counts.", "Decisions logged, adopted, proposed or for review, and open."),
 (2, "Log.", "Filter by source (NBL-Intelligence or NBL-AquaTwin), by status, or by a word. The coloured bar shows status: green adopted, amber proposed, red open, blue recorded."),
 (3, "Record a decision.", "Write the decision and the reason or evidence, then click <b>Record decision</b>."),
 (4, "Open actions.", "The integrity differences still to settle. <b>Draft a decision</b> fills the form for you.")])}
""")

# 14 Knowledge
H.append(f"""
<h1>Knowledge: searching the project documents</h1>
<p>The project's own documents (desk study, scope, ADMT protocol and reports, AquaTwin reports and guide, WaterPlan notes) are indexed on your computer. Nothing is sent anywhere for the search.</p>
{fig("knowledge", "Searching for “transformer noise”.", [(1, ".grid.g4", 0), (2, "section.card", "10 passages"), (3, "section.card", "Indexed")], crop=(236, 0, 1600, 1100))}
{keys([
 (1, "Index summary.", "Documents, passages (searchable text blocks) and sources."),
 (2, "Results.", "The best passages, with matched words highlighted, the file name and the folder it came from. <b>Summarise with AI</b> asks the AI to sum them up with file names."),
 (3, "Indexed documents.", "Every file in the index, grouped by where it lives. Click <b>Re-index</b> at the top after adding documents.")])}
""")

# 15 Reports
H.append(f"""
<h1>Reports: the Word report</h1>
<p>One click makes a Word report in the NBL house format: Times New Roman, navy headings, labelled tables, figures at 600 DPI, and the pre-drilling stamp on every groundwater result.</p>
{fig("reports", "The Reports page.", [(1, "section.card", "New site"), (2, "section.card", "Generated")], crop=(236, 0, 1600, 945))}
{keys([(1, "New report.", "Choose the water-plan run to include (an approved run is best) and, if you wish, an AI conversation as notes. The six sections are listed under <b>Report at a glance</b>. Click <b>Generate Word report</b>."),
 (2, "Generated reports.", "Every report made on this computer. Click <b>Open</b> to open it in Word.")])}
""")

# 16 Settings
H.append(f"""
<h1>Settings: AI key, folders and updates</h1>
{fig("settings", "The Settings page.", [(1, "section.card", "Updates"), (2, "section.card", "NVIDIA"), (3, "section.card", "Engines")], crop=(236, 0, 1600, 1309))}
{keys([(1, "Updates.", "Check for updates, download and install, restart, or roll back (chapter 4)."),
 (2, "NVIDIA reasoning.", "The AI key and model settings."),
 (3, "Engines and project folders.", "Where NBL-AquaTwin, NBL-WaterPlan and the site folder are. Change a path and click <b>Save folders</b>.")])}
<h2>Add the NVIDIA key</h2>
{steps([
 "Go to <b>build.nvidia.com</b>, sign in, and create an API key. It starts with <b>nvapi-</b>.",
 "In NBL-Intelligence open <b>Settings</b>. Paste the key in <b>API key</b> and click <b>Save</b>. It is stored in Windows Credential Manager, never in the program folder.",
 "Click <b>Test connection</b>. A green message shows the model that answered.",
 "The AI chip at the top now says <b>AI reasoning on</b>."])}
{tip("Keep the key private. Never paste it in e-mails, chats or documents. If it has been shared, delete it on build.nvidia.com and create a new one.", "care")}
<p>The other AI settings rarely need changing: <b>Main model</b> and <b>Fallback model</b> (used when the main one does not answer), <b>Show answers word by word</b>, <b>Timeout</b>, <b>Max steps</b> (how many engine results the AI may read for one answer) and <b>Temperature</b> (keep 0.2 for factual answers).</p>
""")

# 17 Website
H.append(f"""
<h1>The website and website AI</h1>
<p>The website, <b>geopromilton.github.io/NBL-Intelligence</b>, is a read-only copy of the Siddanahalli view. Anyone with the link can open the 3D twin, drilling sites, water plans for 2 to 6 persons per flat in dry, expected and wet years, recharge and integrity. The suggested questions show prepared answers.</p>
<h2>Asking your own questions on the website</h2>
<p>Team members can switch on live NVIDIA reasoning with a passcode:</p>
{steps(["Open the website and click <b>Unlock AI</b> at the top right.", "Type the team passcode and click <b>Unlock</b>. This browser remembers it.", "The chip changes to <b>AI reasoning on</b>. Ask any question on the Intelligence page.", "To stop, click the chip and choose <b>Lock AI</b>."])}
<div class="two">
{plain_fig(IMG / 'web_unlock.png', "Website before unlocking: the Unlock AI chip at top right.", width="49%")}
{plain_fig(IMG / 'web_answer.png', "After unlocking, the website answers a new question with live reasoning.", width="49%")}
</div>
<p>On the website the AI uses the published results: site facts, drilling sites, zones, confidence, recharge, MODFLOW, assumptions, rainfall, integrity, decisions and the prepared water plans. It cannot search the project documents or run new plans with other inputs; the Windows app can.</p>
<h2>For the administrator: switching website AI on (once)</h2>
<p>NVIDIA does not accept calls straight from web pages, and a key must never be placed in a web page. A small relay on Cloudflare (free plan) holds the key and checks the passcode.</p>
{steps([
 "Create a free Cloudflare account at <b>dash.cloudflare.com/sign-up</b>. Open <b>Workers &amp; Pages</b> once and choose a <b>workers.dev</b> name when asked.",
 "Copy the <b>Account ID</b> shown in Workers &amp; Pages.",
 "Cloudflare → <b>My Profile → API Tokens → Create Token</b> → template <b>Edit Cloudflare Workers</b> → <b>Create Token</b>. Copy it.",
 "GitHub repository → <b>Settings → Secrets and variables → Actions → New repository secret</b>. Add four secrets: <b>CLOUDFLARE_API_TOKEN</b>, <b>CLOUDFLARE_ACCOUNT_ID</b>, <b>NVIDIA_API_KEY</b> and <b>AI_PASSCODE</b> (a passcode you choose for the team).",
 "GitHub → <b>Actions → AI relay → Run workflow</b>. When it is green, open <b>https://nbl-intelligence-relay.&lt;your-name&gt;.workers.dev/health</b>; it should say <i>key_set: true</i>.",
 "GitHub → <b>Settings → Secrets and variables → Actions → Variables → New variable</b>: name <b>AI_RELAY_URL</b>, value the relay address from step 5.",
 "GitHub → <b>Actions → Website → Run workflow</b>. The website now shows <b>Unlock AI</b>."])}
{tip("Questions asked on the website use your NVIDIA account. The relay allows only the two NBL-Intelligence models, limits each reply, and limits each visitor to 20 questions a minute. To change the passcode, update the AI_PASSCODE secret and run <b>AI relay</b> again.", "note")}
""")

# 18 tasks
H.append(f"""
<h1>Everyday tasks, step by step</h1>
<h2>Check a plan for more people in a dry decade</h2>
{steps(["Open <b>Water plan</b>.", "Choose <b>Dry</b>; set <b>Persons per flat</b> to 6.", "Read net zero discharge, reliability and the tanker volume. Note their periods.", "Click <b>Run and save this plan</b>.", "Open <b>Scenarios</b>, click both the design run and the new run, and compare.", "Approve the run you accept."])}
<h2>Prepare a drilling briefing</h2>
{steps(["Open <b>Explore</b>; click Site A, then B and C, and read their reasons and locked predictions.", "Open <b>Site twin</b>; turn on <b>Anomaly zones</b> and use a <b>Cutaway</b> through Site A.", "On <b>Intelligence</b> ask: “Compare A, B and C for the first borehole and list what the borehole must log and test.”", "Open <b>Reports</b> and generate the Word report."])}
<h2>Settle a difference between the engines</h2>
{steps(["Open <b>Integrity</b> and read the yellow rows.", "Decide what to do (re-run a model, update the registry, or accept the difference).", "Click <b>Record a decision</b> and write the reason.", "After fixing the source, click <b>Re-check</b>."])}
<h2>Find what a document says</h2>
{steps(["Open <b>Knowledge</b>.", "Type a few words, for example “infiltration test”, and press Enter.", "Read the passages; click <b>Summarise with AI</b> for a short summary with file names."])}
""")

# 19 problems
H.append(f"""
<h1>Problems and answers</h1>
{table(["What you see", "What to do"], [
 ["<b>AI offline</b> or <b>Add NVIDIA key</b>", "Add the key in Settings (chapter 16). Until then, answers come straight from the engines."],
 ["The AI says it could not reach the service", "Check the internet connection. Click <b>Test connection</b> in Settings. The fallback model is tried automatically."],
 ["“AquaTwin not found” or empty pages", "Settings → Engines and project folders: check the three folder paths, click <b>Save folders</b>."],
 ["The 3D twin is blank or slow", "Update the graphics driver; close other heavy programs; use <b>Cells</b> or a smaller depth window."],
 ["“Windows protected your PC” when installing", "Click <b>More info</b>, then <b>Run anyway</b>."],
 ["Something looks wrong after an update", "Settings → Updates → <b>Roll back to the previous version</b>, then restart."],
 ["Website: <b>Unlock AI</b> says the passcode was not accepted", "Ask the administrator for the current passcode."],
 ["Website: no <b>Unlock AI</b> chip", "Website AI has not been switched on yet (chapter 17, administrator steps)."],
 ["Two numbers seem to disagree", "Compare their period and case labels first. If they truly differ, see Integrity."]])}
""")

# 20 quick ref
H.append(f"""
<h1>Quick reference</h1>
{table(["Keys and mouse", ""], [["Ctrl + K", "Quick search: jump to a page or ask a question"], ["Enter", "Ask the question typed in the ask box"], ["Esc", "Close a window or the quick search"], ["Left-drag / right-drag / wheel", "Turn / move / zoom the 3D twin"]])}
{table(["Colour", "Meaning"], [["<span class='sw' style='background:#3DDC97'></span> Green", "Agrees, adopted, yes"], ["<span class='sw' style='background:#F5B041'></span> Amber", "Differs, proposed, assumption, take care"], ["<span class='sw' style='background:#F26B6B'></span> Red", "Open problem or exclusion zone"], ["<span class='sw' style='background:#22D3EE'></span> Cyan / blue", "Water, rainwater, priority sites"], ["<span class='sw' style='background:#A78BFA'></span> Purple", "Borewell share in supply charts; very low response in ADMT colours"]])}
{table(["Page", "Use it to"], [
 ["Intelligence", "Ask questions and read sourced answers"], ["Site twin", "See the site and the rock below in 3D"], ["Explore", "Choose where to drill"],
 ["Water plan", "Test demand, rain and storage day by day"], ["Recharge", "See how storm water can be stored underground"], ["Scenarios", "Compare and approve saved plans"],
 ["Integrity", "Check the engines agree"], ["Decisions", "Record and find decisions"], ["Knowledge", "Search the project documents"],
 ["Reports", "Make the Word report"], ["Settings", "AI key, folders, updates"]])}
<p class="end">NBL-Intelligence · Nature Based Living · Vijayanagar Eco-Village Pvt Ltd</p>
""")

CSS = """
@page { size: A4; margin: 20mm 18mm 20mm 18mm;
  @bottom-center { content: counter(page); font-family: 'Times New Roman', 'Liberation Serif', serif; font-size: 10pt; color: #555; }
  @top-right { content: 'NBL-Intelligence user guide'; font-family: 'Times New Roman', 'Liberation Serif', serif; font-size: 9pt; color: #8090A0; } }
@page :first { margin: 0; @bottom-center { content: none; } @top-right { content: none; } }
html { counter-reset: ch; }
body { font-family: 'Times New Roman', 'Liberation Serif', serif; font-size: 11.5pt; line-height: 1.45; color: #1A1A1A; margin: 0; }
h1 { counter-increment: ch; font-size: 22pt; color: #1F3864; margin: 0 0 10pt; padding-bottom: 6pt; border-bottom: 2.5pt solid #2E7D32; break-before: page; }
h1::before { content: counter(ch) '. '; color: #2E7D32; }
h1.nonum { counter-increment: none; } h1.nonum::before { content: none; }
h2 { font-size: 14.5pt; color: #1F3864; margin: 16pt 0 6pt; break-after: avoid; }
p { margin: 0 0 8pt; text-align: justify; } ul, ol { margin: 0 0 8pt 18pt; padding: 0; } li { margin-bottom: 3pt; }
figure { margin: 8pt 0 10pt; break-inside: avoid; display: inline-block; vertical-align: top; }
.two { display: flex; justify-content: space-between; gap: 2%; break-inside: avoid; } .two figure { margin: 6pt 0; }
.shot { position: relative; border: 0.6pt solid #9AA8B8; border-radius: 4pt; overflow: hidden; line-height: 0; }
.shot img { width: 100%; display: block; }
figcaption { font-size: 10pt; color: #333; margin-top: 4pt; line-height: 1.35; text-align: left; }
.box { position: absolute; border: 1.6pt solid #F28C28; border-radius: 4pt; box-shadow: 0 0 0 1pt rgba(255,255,255,.55); }
.mark, .mk { display: inline-flex; align-items: center; justify-content: center; width: 17pt; height: 17pt; border-radius: 50%; background: #F28C28; color: #fff;
  font: bold 10pt 'Times New Roman', 'Liberation Serif', serif; border: 1.3pt solid #fff; box-shadow: 0 1pt 3pt rgba(0,0,0,.45); }
.mark { position: absolute; line-height: 1; }
.mk { width: 15pt; height: 15pt; font-size: 9pt; box-shadow: none; vertical-align: middle; }
table.key { width: 100%; border-collapse: collapse; margin: 2pt 0 10pt; } table.key td { padding: 3pt 4pt; vertical-align: top; } .kn { width: 22pt; }
table.data { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 10.5pt; break-inside: auto; }
table.data th { background: #1F3864; color: #fff; text-align: left; padding: 4pt 6pt; font-weight: bold; }
table.data td { border-bottom: 0.6pt solid #C8D2DC; padding: 4pt 6pt; vertical-align: top; } table.data tr:nth-child(even) td { background: #F4F7FA; }
table.data tr { break-inside: avoid; } table.gloss td:first-child { width: 30%; font-weight: bold; color: #1F3864; }
ol.steps { counter-reset: st; list-style: none; margin-left: 0; } ol.steps li { counter-increment: st; position: relative; padding-left: 26pt; margin-bottom: 5pt; }
ol.steps li::before { content: counter(st); position: absolute; left: 0; top: 0; width: 17pt; height: 17pt; border-radius: 50%; background: #1F3864; color: #fff; font-weight: bold; font-size: 9.5pt; display: flex; align-items: center; justify-content: center; }
.callout { border-left: 4pt solid #2E7D32; background: #EEF7F0; padding: 6pt 10pt; margin: 8pt 0 10pt; break-inside: avoid; font-size: 11pt; }
.callout.note { border-color: #1565C0; background: #EEF4FB; } .callout.care { border-color: #E07B00; background: #FFF5E8; }
.diagram-box { border: 0.6pt solid #C8D2DC; border-radius: 6pt; padding: 8pt; margin: 8pt 0 10pt; break-inside: avoid; } .diagram { width: 100%; } .dcap { font-size: 10pt; margin-top: 4pt; }
.pv { display: inline-block; padding: 1pt 7pt; border-radius: 8pt; font-size: 9.5pt; font-weight: bold; }
.pv.m { background: #DFF5E6; color: #1B6E3A; } .pv.i { background: #E3EEFB; color: #1E4F8F; } .pv.c { background: #DDF3F7; color: #0E6A78; } .pv.f { background: #EDE7FB; color: #5A3FA5; }
.pv.a { background: #FFF0D6; color: #8A5300; } .pv.p { background: #FDE2E2; color: #9B2C2C; } .pv.ai { background: #F1E6FA; color: #6B2FA0; }
.sw { display: inline-block; width: 11pt; height: 11pt; border-radius: 3pt; vertical-align: middle; margin-right: 4pt; }
.cover { height: 297mm; width: 210mm; position: relative; background: linear-gradient(160deg, #071B2E 0%, #0B2E3F 55%, #10402F 100%); color: #fff; overflow: hidden; break-after: page; }
.cover-logo { position: absolute; left: 18mm; top: 18mm; width: 80mm; }
.cover-band { position: absolute; left: 18mm; right: 18mm; top: 62mm; }
.cover-kicker { font-size: 13pt; letter-spacing: 3pt; text-transform: uppercase; color: #7CF0BE; }
.cover-title { font-size: 44pt; margin: 4mm 0 3mm; border: 0; color: #fff; padding: 0; break-before: auto; counter-increment: none; } .cover-title::before { content: none; }
.cover-sub { font-size: 15pt; color: #CFE3F1; line-height: 1.4; }
.cover-shot { position: absolute; left: 18mm; right: 18mm; top: 118mm; width: 174mm; border-radius: 4mm; border: 0.8pt solid rgba(255,255,255,.35); }
.cover-foot { position: absolute; left: 18mm; bottom: 18mm; font-size: 11pt; color: #CFE3F1; line-height: 1.5; }
.toc { break-after: page; } .toc-list { font-size: 13pt; line-height: 1.9; margin-left: 20pt; color: #1F3864; }
.end { margin-top: 24pt; text-align: center; color: #667; font-size: 10pt; }
"""

html = f"<!doctype html><html><head><meta charset='utf-8'><title>NBL-Intelligence user guide</title><style>{CSS}</style></head><body>{''.join(H)}</body></html>"
(G / "guide.html").write_text(html, encoding="utf-8")
out = G / "NBL-Intelligence_User_Guide.pdf"
subprocess.run(["/usr/bin/google-chrome", "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                f"--print-to-pdf={out}", "--virtual-time-budget=20000", f"file://{G / 'guide.html'}"], check=True, capture_output=True)
print("PDF", out, round(out.stat().st_size / 1e6, 1), "MB")
