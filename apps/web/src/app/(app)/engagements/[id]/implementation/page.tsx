import { redirect } from "next/navigation";

export default function ImplementationPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/engagements/${params.id}`);
}
