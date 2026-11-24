import { redirect } from "next/navigation";

/* The new atlas was built at /atlas/v3; it is now /atlas itself. Old links keep working. */
export default async function AtlasV3Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  const qs = q.toString();
  redirect(qs ? `/atlas?${qs}` : "/atlas");
}
