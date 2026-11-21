import React from "react";
const P = (d: React.ReactNode, s = 18) => (props: { size?: number }) => (
  <svg width={props.size || s} height={props.size || s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
export const I = {
  spark: P(<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" /></>),
  cube: P(<><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M12 22V12M21 7l-9 5-9-5" /></>),
  drill: P(<><path d="M12 2v6M8 8h8l-2 4h-4z" /><path d="M12 12v10" strokeDasharray="2 2" /><path d="M4 22h16" /></>),
  drop: P(<path d="M12 3c5 6 7 9.5 7 12a7 7 0 0 1-14 0c0-2.5 2-6 7-12z" />),
  recharge: P(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M3 19h18M5 22h14" /></>),
  layers: P(<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>),
  shield: P(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  gavel: P(<><path d="M14 4l6 6M11 7l6 6M4 20l7-7M12.5 5.5l6 6-3 3-6-6z" /></>),
  book: P(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5" /></>),
  doc: P(<><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>),
  gear: P(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  compare: P(<><path d="M8 3v18M16 3v18M3 8h5M16 16h5M3 16h5M16 8h5" /></>),
  search: P(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>),
  send: P(<><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>),
  sun: P(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: P(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />),
  pin: P(<><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>),
  check: P(<path d="M5 12l5 5 9-10" />),
  x: P(<path d="M6 6l12 12M18 6L6 18" />),
  download: P(<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>),
  play: P(<path d="M7 4l13 8-13 8z" />),
  refresh: P(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>),
};
