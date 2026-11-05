import { redirect } from "next/navigation";

// The staff dashboard lives at /staff; this keeps old links working.
export default function ProfessorRedirect() {
  redirect("/staff");
}
