import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readUiPrefs, UI_DEFAULTS, type UiPrefs } from "./prefs";

/** The signed-in user's UI prefs from user_settings.settings, or defaults (signedIn=false) for visitors. */
export async function loadUiPrefs(): Promise<{ prefs: UiPrefs; signedIn: boolean }> {
  try {
    const sb = await createClient();
    if (!sb) return { prefs: UI_DEFAULTS, signedIn: false };
    const { data } = await sb.auth.getUser();
    if (!data.user) return { prefs: UI_DEFAULTS, signedIn: false };
    const { data: row } = await sb.from("user_settings").select("settings").eq("user_id", data.user.id).maybeSingle();
    return { prefs: readUiPrefs(row?.settings ?? {}), signedIn: true };
  } catch {
    return { prefs: UI_DEFAULTS, signedIn: false };
  }
}
