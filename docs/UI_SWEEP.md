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

## Staff and professor

Audited as perf-probe@uvm.edu (temporarily professor of NSCI3250A), read-only: nothing was submitted or clicked that writes. Shots in `_atlas/staff_shots/`. Pages: `/staff` (1440 and 390), `/staff/student/[id]` (1440, 390, malformed id -> 404 page), `/professor` (307 redirect to /staff). The only staff-only nav entry is "Staff" (Admin is admin-only and out of scope).

| Item | Status |
|---|---|
| Staff nav link missing for course TAs/professors whose profile role is "student" (only profile-role staff saw it; the probe had no way to reach /staff) | fixed (NavBar also checks course enrollments) |
| Roster toolbar (search, section filter, Export CSV) overflowed the card on phones, Export clipped | fixed (wraps) |
| Roster "Reset" (and At-risk "Send reset email") emailed a password reset on a single click | fixed (confirm dialog first) |
| Trend chart axis labels ~6px on phones | fixed (larger on small screens) |
| Layout at 1440 and 390, empty states (no weak spots, no at-risk, no mock practicals), roster wide table scrolls inside its card on phones | fine |
| Copy: "Summaries only..." notes present on both pages | fine |
| Members list on phones: role label sits on its own line, ragged but readable | not fixed (minor) |
| Student page "Last seen" uses the server locale date format (11/9/2026), roster uses "3 days ago" | not fixed (inconsistent, minor) |
| Theme tokens: no hard-coded colours in `src/components/staff/*`; Academia and Synthwave were NOT visually checked (the headless theme switch via data-theme did not stick, shots show UVM) | open |
| Weak-spot heatmap with data (needs 3+ students), at-risk list populated, Temp pw (admin only), keyboard focus walk | not reached (only 2 students enrolled; no writes allowed) |

SPEC check: no item-level data is shown. The student page uses `staff_student_detail` (per-unit percentages, practical scores, daily minutes), guarded by `is_course_staff` and student-only target; class weak spots are anonymous and need 3+ students. Writes (join code, settings, roles, resets, temp passwords) are only offered to professors/admins in the UI (`canManage`); TAs see the dashboard and members without Make TA/Course settings. I did not test the server actions' own role checks for a TA. No privacy concern found. Course images auth-gating is not on these pages and was not tested.
