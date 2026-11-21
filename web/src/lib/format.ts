export function fmt(v: any, digits?: number): string {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "number") {
    if (!isFinite(v)) return "–";
    const a = Math.abs(v);
    const d = digits ?? (a >= 1000 ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : 2);
    return v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }
  return String(v);
}
export const unit = (u?: string) => (u || "").replace(/m3/g, "m³").replace(/m2/g, "m²");
export const toolEngine = (t: string) =>
  ["run_water_plan", "rainfall_outlook"].includes(t) ? "wp" :
  ["search_documents"].includes(t) ? "kb" : ["integrity_checks", "decisions", "site_brief"].includes(t) ? "ck" : "at";
export const toolLabel: Record<string, string> = {
  site_brief: "Registry · site facts", drilling_sites: "AquaTwin · drilling sites", borewell_checks: "AquaTwin · reference borewells",
  admt_zones: "AquaTwin · ADMT zones", confidence_panel: "AquaTwin · confidence panel", recharge_points: "AquaTwin · recharge points",
  cloudburst_tiers: "AquaTwin · cloudburst tiers", modflow_scenarios: "AquaTwin · MODFLOW scenarios", assumption_register: "AquaTwin · assumptions",
  run_water_plan: "WaterPlan · run plan", rainfall_outlook: "WaterPlan · rainfall outlook", integrity_checks: "Integrity checks",
  decisions: "Decision log", search_documents: "Documents · search", aquatwin_report: "AquaTwin · run report",
};
