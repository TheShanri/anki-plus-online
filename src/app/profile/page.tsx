import { PageShell } from "@/components/PageShell";
import { labSectionsOf } from "@/lib/auth";
import { requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage() {
  const viewer = await requireUser("/profile");
  const admin = createAdminClient();
  const { data: p } = await admin!
    .from("profiles")
    .select("email, display_name, pronouns, class_year, major, minor, extra")
    .eq("id", viewer.id)
    .maybeSingle();
  const { data: enr } = await admin!
    .from("enrollments")
    .select("course_id, lab_section, courses(title, settings)")
    .eq("user_id", viewer.id)
    .order("joined_at")
    .limit(1)
    .maybeSingle();
  const course = Array.isArray(enr?.courses) ? enr?.courses[0] : enr?.courses;
  return (
    <PageShell title="Your profile" kicker="Account">
      <ProfileForm
        mustChange={Boolean((p?.extra as { must_change_password?: boolean } | null)?.must_change_password)}
        p={{
          email: p?.email ?? viewer.email,
          displayName: p?.display_name ?? "",
          pronouns: p?.pronouns ?? "",
          classYear: p?.class_year ?? "",
          major: p?.major ?? "",
          minor: p?.minor ?? "",
          courseId: enr?.course_id ?? "",
          courseTitle: course?.title ?? "",
          labSection: enr?.lab_section ?? "",
          labSections: labSectionsOf(course?.settings),
        }}
      />
    </PageShell>
  );
}
