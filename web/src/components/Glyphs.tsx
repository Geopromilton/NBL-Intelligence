import React from "react";

/** Line glyphs (24x24). Used inside IconBadge and as hero icons. */
const G: Record<string, React.ReactNode> = {
  drop: <path d="M12 3c4.6 5.6 7 9.3 7 12a7 7 0 0 1-14 0c0-2.7 2.4-6.4 7-12z" />,
  drops: <><path d="M9 4c3 3.6 4.5 6 4.5 7.8a4.5 4.5 0 0 1-9 0C4.5 10 6 7.6 9 4z" /><path d="M16.5 10c2.3 2.8 3.5 4.6 3.5 6a3.5 3.5 0 0 1-7 0" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M7.5 12.3l3 3 6-6.6" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  tank: <><ellipse cx="12" cy="5.5" rx="7" ry="2.5" /><path d="M5 5.5v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-12" /><path d="M5 11.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 17.5l9 5 9-5" opacity=".6" /></>,
  rain: <><path d="M7 15a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 7.5a3.8 3.8 0 0 1-.6 7.5z" /><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" /></>,
  rock: <><path d="M4 16l3-7 5-3 6 3 2 7-6 3H8z" /><path d="M7 9l5 4 6-4M12 13v6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  warn: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.6" /><path d="M15.5 14.2A5 5 0 0 1 21 19" /></>,
  building: <><rect x="5" y="3" width="10" height="18" rx="1" /><path d="M15 9h4v12h-4M8 7h1M11 7h1M8 11h1M11 11h1M8 15h1M11 15h1" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10M10 20v-6h4v6" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  hourglass: <><path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14.3-4.2L4 9" /><path d="M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.3 4.2L20 15" /><path d="M20 20v-5h-5" /></>,
  doc: <><path d="M6 2.5h8.5L19 7v14.5H6z" /><path d="M14 2.5V7h5M9 12h7M9 16h7" /></>,
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />,
  cube: <><path d="M12 2.5l8.5 4.7v9.6L12 21.5l-8.5-4.7V7.2z" /><path d="M12 21.5V12M20.5 7.2L12 12 3.5 7.2" /></>,
  spark: <><path d="M12 3l1.9 5.3L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.7z" /><path d="M19 15.5l.7 2.1 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></>,
  leaf: <><path d="M5 19c0-8 5-13 15-14-.5 9-5.5 14-13 14" /><path d="M5 19c3-4 6-6.5 10-8.5" /></>,
  recycle: <><path d="M7 19H4l3.5-6M17 19h3l-3.5-6M9 5l3-2 3 5" /><path d="M8 13l-1.5-2.6M16 13l1.5-2.6M10 19h4" /></>,
  scale: <><path d="M12 3v18M7 21h10M5 7h14" /><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" /></>,
  pin: <><path d="M12 22s7-6.4 7-12a7 7 0 0 0-14 0c0 5.6 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  book: <><path d="M3 5.5C6 4 9 4 12 6c3-2 6-2 9-.5V19c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5z" /><path d="M12 6v13.5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  drill: <><path d="M12 2v5M8 7h8l-2 4h-4z" /><path d="M12 11v9" strokeDasharray="2 2" /><path d="M5 21h14" /></>,
  recharge: <><path d="M12 3v11M7.5 9.5L12 14l4.5-4.5" /><path d="M3 18h18M6 21h12" /></>,
  compare: <><path d="M8 3v18M16 3v18M3 8h5M16 16h5M3 16h5M16 8h5" /></>,
  gavel: <><path d="M14 4l6 6M11 7l6 6M4 20l7-7M12.5 5.5l6 6-3 3-6-6z" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></>,
  roof: <><path d="M2 12l10-7 10 7" /><path d="M5 10.5V20h14v-9.5" /><rect x="9" y="13" width="6" height="4" /></>,
  grid3: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  mountain: <><path d="M2 20l7-12 4 6 3-4 6 10z" /><path d="M7.5 10.5l1.5 1.5 1.5-1.5" /></>,
  chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
};

export function Glyph({ name, size = 22, color = "currentColor", stroke = 1.8 }: { name: string; size?: number; color?: string; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{G[name] || G.info}</svg>;
}

const TONES: Record<string, [string, string, string]> = {
  green: ["#7CF2C1", "#1FB673", "#0B5E3C"], aqua: ["#8DF1FF", "#16B8D6", "#075A73"], blue: ["#9CCBFF", "#2F86E8", "#123F82"],
  amber: ["#FFE29A", "#F0A93A", "#7A4A0C"], violet: ["#D7C7FF", "#8E6BEA", "#3E2A86"], red: ["#FFB4B4", "#E5484D", "#7A1C20"],
  teal: ["#9EF3E2", "#1FB5A0", "#0B5A50"], slate: ["#D7E6F2", "#6F8CA6", "#2B425A"],
};

/** Glossy round badge with a white glyph, as in the NBL reference designs. */
export function IconBadge({ name, tone = "aqua", size = 52 }: { name: string; tone?: string; size?: number }) {
  const [hi, mid, lo] = TONES[tone] || TONES.aqua;
  const id = `ib-${tone}-${name}`;
  return (
    <svg className="badge-ico" width={size} height={size} viewBox="0 0 52 52">
      <defs>
        <radialGradient id={id} cx="35%" cy="28%" r="78%"><stop offset="0" stopColor={hi} /><stop offset=".55" stopColor={mid} /><stop offset="1" stopColor={lo} /></radialGradient>
        <linearGradient id={id + "s"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <circle cx="26" cy="26" r="24" fill={`url(#${id})`} />
      <ellipse cx="26" cy="15" rx="16" ry="9" fill={`url(#${id}s)`} />
      <circle cx="26" cy="26" r="23.5" fill="none" stroke="#fff" strokeOpacity=".35" />
      <g transform="translate(13 13)"><Glyph name={name} size={26} color="#fff" stroke={2} /></g>
    </svg>
  );
}

/** Large outline hero icon with a green glow. */
export function HeroIcon({ name }: { name: string }) {
  return (
    <svg className="hero-icon" viewBox="0 0 24 24" fill="none" stroke="url(#heroG)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs><linearGradient id="heroG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#B6FF8A" /><stop offset="1" stopColor="#22C55E" /></linearGradient></defs>
      {G[name] || G.leaf}
    </svg>
  );
}
