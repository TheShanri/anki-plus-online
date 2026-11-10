// Atlas progress events: every atlas mode reports what the student did through trackAtlas(); the achievements
// system listens for ATLAS_PROGRESS_EVENT (persists, awards, shows toasts). Fire-and-forget, never throws.

export type AtlasEvent =
  | { type: "structure_viewed"; slug: string; via: "3d" | "mri" | "brainstem" | "info" }
  | { type: "curious_unlock"; mesh: string; name: string }
  | { type: "view_changed"; view: string }
  | { type: "multiview_opened" }
  | { type: "cut_used"; plane: string }
  | { type: "quiz_answer"; slug: string; correct: boolean; streak: number; pool: string; mode?: "type" | "choice" }
  | { type: "quiz_finished"; correct: number; total: number; pool: string }
  | { type: "pathway_completed"; pathway: string; quizCorrect?: number; quizTotal?: number }
  | { type: "lesion_case"; caseId: string; correct: boolean }
  | { type: "slice_match_round"; errorMm: number }
  | { type: "supply_answer"; slug: string; correct: boolean; artery?: string }
  | { type: "supply_tour_step"; step: number }
  | { type: "supply_occlusion"; artery: string }
  | { type: "supply_drainage_step"; step: number }
  | { type: "supply_bleeds_opened" }
  | { type: "brainstem_level_viewed"; level: string; style: string }
  | { type: "brainstem_label"; level: string; slug: string; correct: boolean }
  | { type: "memory_map_opened" };

export const ATLAS_PROGRESS_EVENT = "anki:atlas-progress";

export type AtlasEventDetail = AtlasEvent & { at: number };

export function trackAtlas(e: AtlasEvent): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<AtlasEventDetail>(ATLAS_PROGRESS_EVENT, { detail: { ...e, at: Date.now() } }));
  } catch {
    /* never break the atlas over progress tracking */
  }
}
