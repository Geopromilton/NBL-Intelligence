# NBL-Intelligence - User Guide

## 1. Terms

* **Engine**: a program that calculates. NBL-AquaTwin (groundwater) and NBL-WaterPlan (water balance) are the two engines.
* **Tool**: one engine function the AI may call, for example "run water plan" or "drilling sites".
* **Provenance**: where a value comes from. Measured (green), source document (blue), calculated (teal), forecast (violet), assumption (amber), placeholder (orange).
* **Period and case**: when and under which conditions a number holds: per day / per year / over the run; expected, dry or wet rain; design.
* **Readings (I-POS, I-NEU, I-NEG)**: the positive, neutral and negative interpretations of the ADMT classes, carried in parallel until borehole evidence.
* **Integrity check**: a comparison of the same number in the registry, AquaTwin and WaterPlan.

## 2. Ask a question (Intelligence page)

1. Type a question and press Enter, or click a suggestion. Ctrl K opens the command bar from any page.
2. The answer card shows the tools the AI called (AquaTwin in teal, WaterPlan in green, documents in violet, checks in orange), the answer, the key numbers with provenance, the evidence and what would change the answer.
3. If the AI suggests a decision, click **Approve** to record it in the decision log or **Reject** to dismiss it.
4. Conversations are saved; open them again from the right-hand list.

Worked example: "Can the site stay net zero discharge with 6 persons per flat in a dry decade?" The AI runs WaterPlan with 6 persons per flat and the dry rain case (P10 of the drawn futures), reports demand per day, the share of rain, reused water and borewell water, the tanker volume and whether any water leaves the lease. The run is saved on the Scenarios page.

## 3. Site twin

* Drag to rotate, right-drag to pan, scroll to zoom. Oblique, Plan and Section set the camera.
* Click a label (site, borewell, RZ point) for details.
* **ADMT response cells**: the levelled response for every kept cell. Purple is very low (clay-like or saline), blue is the water-bearing signal, red is high.
* **Permeable probability (M5)**: cells whose probability of a permeable class is at or above the threshold, for the chosen reading. The negative reading has no permeable class by definition.
* Depth window, terrain exaggeration and depth scale change the view only.

## 4. Water plan

Move any slider; the plan re-runs in about a second. Persons per flat is adjustable from 2 to 6 (design value 4). "Save scenario" stores the run with its fingerprint for comparison and approval.

## 5. Integrity

Each card lists the value held by every source and the action to take. Nothing is changed automatically. Current differences for Siddanahalli: lease area (AquaTwin Studio card uses the older 4.35 ha). The flat count (141), people and roof area now agree across the registry, WaterPlan and the AquaTwin run.

## 6. Reports

Choose a saved scenario (or the latest) and optionally an AI conversation, then click **Generate Word report**. The report uses Times New Roman, navy headings, labelled tables and a 600 DPI figure with two panels.

## 7. AI settings

The default model is DeepSeek v4.1 Flash on the NVIDIA API catalog, with Nemotron as the automatic fallback. Any OpenAI-compatible service can be used instead (for example a local Ollama for offline work). What is sent: your question and the engine results the AI asks for. Raw survey files and full documents stay on the computer.
