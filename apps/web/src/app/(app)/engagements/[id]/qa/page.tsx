import { redirect } from "next/navigation";

export default function QAPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/engagements/${params.id}`);
}
