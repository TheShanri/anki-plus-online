import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, getAuthUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const body = z.object({
  theme: z.enum(["uvm-clinical", "dark-academia", "synthwave-cortex"]),
  ui: z.object({
    mode: z.enum(["auto", "light", "dark"]),
    effects: z.enum(["full", "subtle", "off"]),
    volume: z.number().min(0).max(1),
    ambient: z.boolean(),
    dailyGoal: z.number().int().min(5).max(500),
    vibeChosen: z.boolean(),
  }),
});

/** PUT /api/theme: save the theme + UI prefs to user_settings.settings (atomic merge; other keys survive). */
export async function PUT(req: NextRequest) {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { error } = await sb.rpc("theme_save_prefs", { p_theme: p.data.theme, p_ui: p.data.ui });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
