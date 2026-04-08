import { notFound } from "next/navigation";
import { prisma } from "@rex/shared";
import { WalkthroughViewer } from "@/components/walkthrough-viewer";

export default async function SharedWalkthroughPage({
  params,
}: {
  params: { shareToken: string };
}) {
  const walkthrough = await prisma.walkthrough.findUnique({
    where: { shareToken: params.shareToken },
    include: {
      steps: { orderBy: { stepOrder: "asc" } },
      engagement: {
        select: { name: true, clientName: true },
      },
    },
  });

  if (!walkthrough || walkthrough.status !== "READY") {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <WalkthroughViewer
        title={walkthrough.title}
        description={walkthrough.description}
        clientName={walkthrough.engagement.clientName}
        engagementName={walkthrough.engagement.name}
        steps={walkthrough.steps.map((s) => ({
          id: s.id,
          stepOrder: s.stepOrder,
          category: s.category,
          title: s.title,
          narration: s.narration,
          context: s.context,
          screenshotUrl: s.screenshotUrl,
          annotations: s.annotations,
        }))}
        shareToken={walkthrough.shareToken}
        branded
      />
    </div>
  );
}
