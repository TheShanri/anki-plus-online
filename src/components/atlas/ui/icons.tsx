/** Small custom glyphs (lucide has no cutting-plane icons). 24x24, currentColor. */
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const Cube = () => (
  <>
    <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
    <path d="M4 7.5 12 12l8-4.5M12 12v9" />
  </>
);

export const CutNoneIcon = () => (
  <svg {...base}>
    <Cube />
  </svg>
);
/** Coronal: a plane facing front-back (vertical, across the screen). */
export const CutCoronalIcon = () => (
  <svg {...base}>
    <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" opacity="0.4" />
    <rect x="5" y="5" width="14" height="14" rx="1" strokeDasharray="2 2" />
    <path d="M5 12h14" strokeWidth="2.4" />
  </svg>
);
export const CutSagittalIcon = () => (
  <svg {...base}>
    <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" opacity="0.4" />
    <rect x="5" y="5" width="14" height="14" rx="1" strokeDasharray="2 2" />
    <path d="M12 5v14" strokeWidth="2.4" />
  </svg>
);
export const CutTransverseIcon = () => (
  <svg {...base}>
    <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" opacity="0.4" />
    <path d="M3 12 12 8l9 4-9 4-9-4Z" strokeWidth="2" />
  </svg>
);
export const ShellIcon = () => (
  <svg {...base}>
    <path d="M5 15c0-5 3-9 7-9s7 4 7 9" />
    <path d="M5 15h14" strokeDasharray="2 2.4" />
    <path d="M8 15c0-3 1.7-5.4 4-5.4s4 2.4 4 5.4" opacity="0.55" />
  </svg>
);
export const SolidIcon = () => (
  <svg {...base}>
    <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" fill="currentColor" fillOpacity="0.25" />
    <path d="M4 7.5 12 12l8-4.5M12 12v9" />
  </svg>
);
export const SeeThroughIcon = () => (
  <svg {...base}>
    <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" strokeDasharray="2.4 2" />
    <circle cx="12" cy="12" r="2.6" fill="currentColor" />
  </svg>
);
export const NeighborIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.4" />
    <circle cx="5" cy="6" r="2" />
    <circle cx="19" cy="7" r="2" />
    <circle cx="18" cy="18" r="2" />
    <circle cx="6" cy="18" r="2" />
    <path d="m7 7 3 3M17 8.5l-3 2.5M16.5 16.5 14 14M7.5 16.5 10 14" />
  </svg>
);
