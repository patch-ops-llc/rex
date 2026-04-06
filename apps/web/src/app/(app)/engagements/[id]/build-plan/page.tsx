import { redirect } from "next/navigation";

export default function BuildPlanPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/engagements/${params.id}`);
}
