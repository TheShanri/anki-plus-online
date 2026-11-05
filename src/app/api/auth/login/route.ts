import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// One generic error for every failure: no account enumeration.
const fail = () => NextResponse.json({ error: "Wrong email or password." }, { status: 401 });

export async function POST(req: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  try {
    const parsed = loginSchema.safeParse(await req.json());
    if (!parsed.success) return fail();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return fail();
    return NextResponse.json({ ok: true });
  } catch {
    return fail();
  }
}
