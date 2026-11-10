# UI sweep (non-atlas)

Shots: `_atlas/ui_sweep/before/` and `_atlas/ui_sweep/after/`.

| Defect | Status |
|---|---|
| Orbitron zero is slashed (streak, due, stat counters, combo read as "none") | fixed (plain zero in Synthwave) |
| Cormorant old-style zero reads as letter O | fixed (lining figures in Dark Academia) |
| Study topic counts unlabelled, zeros equal weight | fixed (titles, legend, dimmed zeros) |
| Study stats stack into three tall cards on phones | fixed (3-up) |
| Study toolbar on phones ragged | fixed (2-up grid) |
| Tag picker hint wraps title on phones | fixed |
| Settings narrower than other pages | fixed |
| Theme picker three huge previews on phones | fixed (short previews) |
| Run header on phones wraps awkwardly | fixed |
| Typing placeholder wrapped to two lines | fixed (shorter copy, ellipsis) |
| Gear popover used a text glyph, no Escape / outside-click close | fixed |
| About anchor links under 40px | fixed (pills) |
| Login links under 40px | fixed |
| Profile "-" selects, duplicate id="password", no password hint | fixed |
| 404 page default Next (white text on light background) and no error boundary | fixed (not-found.tsx, error.tsx) |
| Mnemonics panel shows plain "Loading..." | not fixed (transient) |
| Next dev indicator overlaps Feedback button | dev only, not fixed |
| Home/Mock practical panel left-aligned with empty right side at 1440 | not fixed (intentional reading width) |

Not reached: staff dashboard, admin review tool, boss fight, summary, multi-part answers, follow-ups, exam mode run (test account / time; headless shots are slow). Synthwave effect cost not measured.
