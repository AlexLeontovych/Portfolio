import type { SVGProps } from "react";

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const ArrowUpRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

export const ArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const ArrowDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

export const ArrowLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

export const Quote = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ fill: "currentColor", stroke: "none", ...p })}>
    <path d="M9.5 6C6.5 6 4 8.5 4 11.6c0 2.7 1.9 4.4 4.2 4.4.5 0 .9-.1 1.1-.2-.4 1.6-1.8 2.8-3.5 3.2l.7 2c3.4-.9 5.5-3.8 5.5-7.6V11C12 8 11 6 9.5 6Zm9 0C15.5 6 13 8.5 13 11.6c0 2.7 1.9 4.4 4.2 4.4.5 0 .9-.1 1.1-.2-.4 1.6-1.8 2.8-3.5 3.2l.7 2c3.4-.9 5.5-3.8 5.5-7.6V11C21 8 20 6 18.5 6Z" />
  </svg>
);

export const Close = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const Search = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
);

export const Star = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ fill: "currentColor", stroke: "none", ...p })}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
  </svg>
);

export const Sparkles = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
  </svg>
);

export const Mail = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

export const Linkedin = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 11v6" />
  </svg>
);

export const Telegram = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M21 4 3 11l5 2 2 6 3-4 5 4z" />
    <path d="m8 13 8-6" />
  </svg>
);

export const Github = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 19c-4 1.4-4-2-6-2.5M15 22v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.6 0-1.3-.5-2.5-1.3-3.4.4-1.1.3-2.4-.2-3.4 0 0-1.1-.3-3.5 1.3a12 12 0 0 0-6.4 0C6 1.3 4.9 1.6 4.9 1.6c-.5 1-.6 2.3-.2 3.4A4.9 4.9 0 0 0 3.4 8.4c0 5 3.1 6.3 6 6.6-.4.4-.7.9-.8 1.5" />
  </svg>
);

export const Motion = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 12h4l2-6 4 14 2-8h6" />
  </svg>
);

export const Globe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
  </svg>
);

export const Shield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3 5 6v5c0 4.4 2.9 7.6 7 9 4.1-1.4 7-4.6 7-9V6l-7-3Z" />
    <path d="M9.7 11.1v-1a2.3 2.3 0 0 1 4.6 0v1" />
    <rect x="8.9" y="11.1" width="6.2" height="4.7" rx="1.2" />
  </svg>
);

export const Pin = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 21s-6.5-5.5-6.5-10A6.5 6.5 0 0 1 18.5 11c0 4.5-6.5 10-6.5 10Z" />
    <circle cx="12" cy="11" r="2.4" />
  </svg>
);

export const Download = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3v12M8 11l4 4 4-4M5 21h14" />
  </svg>
);

export const FileText = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6M8 13h8M8 17h6" />
  </svg>
);
