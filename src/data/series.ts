// href is relative to /blog/, the way the hand-written pages linked it.
export const SERIES = {
  "understanding-windows": {
    title: "Understanding Windows",
    href: "understanding-windows.html",
    ariaLabel: "Understanding Windows series",
    allLabel: "All of Understanding Windows",
  },
  "building-an-edr": {
    title: "Building an EDR",
    href: "../reaperwatch.html",
    ariaLabel: "Building an EDR series",
    allLabel: "All of Building an EDR",
  },
  osint: {
    title: "OSINT",
    href: "index.html#series-osint",
    ariaLabel: "OSINT series",
    allLabel: "All of OSINT",
  },
} as const;

export type SeriesId = keyof typeof SERIES;
