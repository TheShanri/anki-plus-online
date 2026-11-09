"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Divider, IconBtn } from "./Toolbar";
import "./atlas-ui.css";

/** The floating bottom toolbar shell shared by the 3D and MRI viewers: same position, chevron collapse (collapsed on phones). */
export function FloatBar({ label, children, above }: { label: string; children: ReactNode; /** content stacked over the bar (e.g. the cut slider) */ above?: ReactNode }) {
  const [open, setOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 640));
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex flex-col items-center gap-1.5">
      {above}
      <div className="atl-bar pointer-events-auto" role="toolbar" aria-label={label}>
        <IconBtn label={open ? "Hide controls" : "Show controls"} icon={open ? <ChevronDown /> : <ChevronUp />} onClick={() => setOpen((o) => !o)} />
        {open && (
          <>
            <Divider />
            {children}
          </>
        )}
      </div>
    </div>
  );
}
