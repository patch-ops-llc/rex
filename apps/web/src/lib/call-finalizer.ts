import { prisma } from "@rex/shared";

export async function finalizeCall(callId: string): Promise<void> {
  const call = await prisma.discoveryCall.findUnique({
    where: { id: callId },
    include: {
      engagement: true,
      segments: { orderBy: { startTime: "asc" } },
      insights: true,
    },
  });

  if (!call) throw new Error("Call not found");

  // 1. Build structured data from insights
  const structured: Record<string, any[]> = {};
  for (const insight of call.insights) {
    const key = insight.type.toLowerCase();
    if (!structured[key]) structured[key] = [];
    structured[key].push({
      content: insight.content,
      speaker: insight.speaker,
      timestamp: insight.timestamp,
      confidence: insight.confidence,
      metadata: insight.metadata,
    });
  }

  await prisma.discoveryCall.update({
    where: { id: callId },
    data: {
      structuredData: structured,
      status: "COMPLETED",
    },
  });

  // 2. Create CorpusEntry from transcript
  if (call.segments.length > 0) {
    const transcriptLines = call.segments.map((s) => ({
      speaker: s.speaker,
      text: s.text,
      time: `${Math.floor(s.startTime / 60)}:${Math.floor(s.startTime % 60).toString().padStart(2, "0")}`,
    }));

    await prisma.corpusEntry.create({
      data: {
        name: call.title || `Discovery Call - ${call.engagement.clientName}`,
        transcript: transcriptLines,
        tags: ["discovery", "auto-captured", call.platform || "unknown"],
        industry: call.engagement.industry || undefined,
        category: "discovery_call",
        source: `recall:${call.recallBotId}`,
        annotations: {
          engagementId: call.engagementId,
          callId: call.id,
          duration: call.duration,
          insightCounts: {
            total: call.insights.length,
            requirements: call.insights.filter((i) => i.type === "REQUIREMENT").length,
            actionItems: call.insights.filter((i) => i.type === "ACTION_ITEM").length,
            decisions: call.insights.filter((i) => i.type === "DECISION").length,
            scopeConcerns: call.insights.filter((i) => i.type === "SCOPE_CONCERN").length,
          },
        },
      },
    });
  }

  // 3. Seed RequirementItems from REQUIREMENT insights
  const requirements = call.insights.filter((i) => i.type === "REQUIREMENT");
  if (requirements.length > 0) {
    const existingReqs = await prisma.requirementItem.count({
      where: { engagementId: call.engagementId },
    });

    for (let i = 0; i < requirements.length; i++) {
      const req = requirements[i];
      const meta = req.metadata as Record<string, any> | null;

      await prisma.requirementItem.create({
        data: {
          engagementId: call.engagementId,
          category: meta?.category || "discovery",
          question: req.content,
          context: req.speaker
            ? `Mentioned by ${req.speaker} during discovery call`
            : "Captured during discovery call",
          status: "PENDING",
          priority: meta?.priority?.toUpperCase() || "MEDIUM",
          displayOrder: existingReqs + i,
        },
      });
    }
  }

  // 4. Create ScopeAlerts from SCOPE_CONCERN insights
  const scopeConcerns = call.insights.filter(
    (i) => i.type === "SCOPE_CONCERN"
  );
  for (const concern of scopeConcerns) {
    await prisma.scopeAlert.create({
      data: {
        engagementId: call.engagementId,
        type: "SCOPE_CREEP",
        severity: (concern.confidence || 0) >= 0.8 ? "WARNING" : "INFO",
        title: concern.content.length > 80
          ? concern.content.slice(0, 77) + "..."
          : concern.content,
        description: concern.content,
        sourceId: call.id,
        sourceType: "DiscoveryCall",
      },
    });
  }

  // 5. Update pipeline DISCOVERY phase tasks if they exist
  const discoveryTasks = await prisma.projectTask.findMany({
    where: {
      engagementId: call.engagementId,
      phaseType: "DISCOVERY",
      status: { in: ["PENDING", "IN_PROGRESS"] },
    },
  });

  for (const task of discoveryTasks) {
    const titleLower = task.title.toLowerCase();
    if (
      titleLower.includes("conduct discovery") ||
      titleLower.includes("process discovery") ||
      titleLower.includes("identify requirement")
    ) {
      await prisma.projectTask.update({
        where: { id: task.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          outputData: {
            callId,
            insightsExtracted: call.insights.length,
            requirementsFound: requirements.length,
            scopeConcerns: scopeConcerns.length,
          },
        },
      });
    }
  }

  // 6. Log to delivery trail
  await prisma.deliveryLogEntry.create({
    data: {
      engagementId: call.engagementId,
      action: "CALL_PROCESSED",
      phaseType: "DISCOVERY",
      actor: "rex",
      description: `Discovery call processed: ${call.insights.length} insights extracted (${requirements.length} requirements, ${scopeConcerns.length} scope concerns)`,
      metadata: {
        callId,
        duration: call.duration,
        segmentCount: call.segments.length,
        insightsByType: structured,
      },
    },
  });
}
