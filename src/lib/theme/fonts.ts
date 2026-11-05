// Self-hosted at build by next/font. Only the default theme's fonts are preloaded; the others are fetched
// the first time their theme is used (CSS font-face is lazy), so a student on UVM Clinical downloads one family.
import { Inter, JetBrains_Mono, Cormorant_Garamond, EB_Garamond, Orbitron, Space_Grotesk } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], variable: "--ff-inter", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--ff-mono", display: "swap", preload: false });
export const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--ff-cormorant", display: "swap", preload: false });
export const garamond = EB_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--ff-garamond", display: "swap", preload: false });
export const orbitron = Orbitron({ subsets: ["latin"], weight: ["500", "700"], variable: "--ff-orbitron", display: "swap", preload: false });
export const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--ff-grotesk", display: "swap", preload: false });

export const fontVars = [inter, mono, cormorant, garamond, orbitron, grotesk].map((f) => f.variable).join(" ");
