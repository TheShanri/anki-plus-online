import { RunLoader } from "@/components/study/RunLoader";

export const metadata = { title: "Study" };

export default async function RunPage({ searchParams }: { searchParams: Promise<{ scope?: string; limit?: string; course?: string }> }) {
  const sp = await searchParams;
  const limit = Number(sp.limit);
  return <RunLoader scope={sp.scope ?? "all"} limit={Number.isFinite(limit) && limit > 0 ? limit : undefined} course={sp.course} />;
}
