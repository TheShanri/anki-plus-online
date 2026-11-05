import "server-only";
import { cache } from "react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { readUiPrefs, UI_DEFAULTS, type UiPrefs } from "./prefs";

/** The signed-in user's UI prefs from user_settings.settings, or defaults (signedIn=false) for visitors.
 *  Memoised per request (the root layout and the home page both read it). */
export const loadUiPrefs = cache(async (): Promise<{ prefs: UiPrefs; signedIn: boolean }> => {
  try {
    const sb = await createClient();
    if (!sb) return { prefs: UI_DEFAULTS, signedIn: false };
    const user = await getAuthUser();
    if (!user) return { prefs: UI_DEFAULTS, signedIn: false };
    const { data: row } = await sb.from("user_settings").select("settings").eq("user_id", user.id).maybeSingle();
    return { prefs: readUiPrefs(row?.settings ?? {}), signedIn: true };
  } catch {
    return { prefs: UI_DEFAULTS, signedIn: false };
  }
});
