import { redirect } from "next/navigation";

export default function DiscoveryPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/engagements/${params.id}`);
}
