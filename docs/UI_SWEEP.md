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

## Round 2

| Item | Status |
|---|---|
| Mock practical left-aligned with empty right side (1440) | fixed: setup beside recent attempts, or a "How a practical works" panel when none |
| Profile single narrow column at 1024+ | fixed: profile and password side by side from 1024 |
| Run summary and "Study more" | reached and viewed (before/run_multi_uvm_1440.png), no defects |
| Synthwave frame times (home, study run, effects on vs `data-effects="off"`) | measured: p50 16.6 ms, p95 16.8 ms either way (one 116 ms load spike on the run page); no effect changes needed |
| Focus rings | reviewed in CSS: global `:focus-visible` outline plus ring on buttons, inputs, switches, theme cards, chips; no gaps found. Not clicked through by keyboard on every page |
| 768x1024 / 1024x768 | production 768 shots of home, study viewed (before/prod_*_768.png): fine, with "Atlas quiz" wrapping alone onto a second toolbar row (left). Dev-server shots at those sizes caught loading skeletons (the skeleton looks right) |
| Multi-part answer, follow-up, boss fight, parking lot | not reached: theory/multi-part cards and bosses are gated on mastery, which the fresh probe account lacks; auto-play via `__ankiEngine` only produced first-look pin cards |
| Staff dashboard, admin review | not reachable: the probe is a student, and promoting it was blocked by the permission check, so I did not do it |
