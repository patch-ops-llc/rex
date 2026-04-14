import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rex/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
    });

    if (!engagement) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || null;
    const meetingDate = (formData.get("meetingDate") as string) || null;
    const attendees = (formData.get("attendees") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const rawText = await file.text();
    if (!rawText.trim()) {
      return NextResponse.json({ error: "Transcript file is empty" }, { status: 400 });
    }

    const segments = parseTranscript(rawText, file.name);

    const discoveryCall = await prisma.discoveryCall.create({
      data: {
        engagementId: params.id,
        title: title || `Transcript: ${file.name}`,
        status: "COMPLETED",
        summary: buildSummaryFromSegments(segments, rawText),
        rawTranscript: { text: rawText, fileName: file.name, uploadedAt: new Date().toISOString() },
        structuredData: {
          entryType: "transcript_upload",
          fileName: file.name,
          attendees: attendees || extractSpeakers(segments).join(", "),
          meetingDate: meetingDate || null,
          segmentCount: segments.length,
        },
      },
    });

    if (segments.length > 0) {
      const segmentData = segments.map((seg, i) => ({
        discoveryCallId: discoveryCall.id,
        speaker: seg.speaker,
        text: seg.text,
        startTime: seg.startTime ?? i * 1000,
        endTime: seg.endTime ?? (i + 1) * 1000,
        isFinal: true,
      }));

      await prisma.transcriptSegment.createMany({ data: segmentData });
    }

    if (engagement.status === "CREATED" || engagement.status === "SCHEDULED") {
      await prisma.engagement.update({
        where: { id: params.id },
        data: { status: "DISCOVERY" },
      });
    }

    await prisma.deliveryLogEntry.create({
      data: {
        engagementId: params.id,
        action: "TRANSCRIPT_UPLOADED",
        phaseType: "DISCOVERY",
        actor: "user",
        description: `Transcript uploaded: ${file.name} (${segments.length} segments)`,
      },
    });

    return NextResponse.json(
      { ...discoveryCall, _segmentCount: segments.length },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Transcript upload failed:", error);
    return NextResponse.json(
      { error: error.message || "Transcript upload failed" },
      { status: 500 },
    );
  }
}

interface Segment {
  speaker: string;
  text: string;
  startTime?: number;
  endTime?: number;
}

function parseTranscript(raw: string, fileName: string): Segment[] {
  const ext = fileName.toLowerCase().split(".").pop();

  if (ext === "vtt" || ext === "srt") {
    return parseTimedTranscript(raw);
  }

  return parseSpeakerTranscript(raw);
}

function parseTimedTranscript(raw: string): Segment[] {
  const segments: Segment[] = [];
  const blocks = raw.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    const timeMatch = lines.find((l) => l.includes("-->"));
    if (!timeMatch) continue;

    const [startStr, endStr] = timeMatch.split("-->").map((s) => s.trim());
    const startTime = parseTimestamp(startStr);
    const endTime = parseTimestamp(endStr);

    const textLines = lines.filter((l) => l !== timeMatch && !/^\d+$/.test(l.trim()));
    const fullText = textLines.join(" ").replace(/<[^>]+>/g, "").trim();
    if (!fullText) continue;

    const speakerMatch = fullText.match(/^([^:]{1,40}):\s*(.+)/);
    segments.push({
      speaker: speakerMatch ? speakerMatch[1].trim() : "Speaker",
      text: speakerMatch ? speakerMatch[2].trim() : fullText,
      startTime,
      endTime,
    });
  }

  return segments;
}

function parseSpeakerTranscript(raw: string): Segment[] {
  const segments: Segment[] = [];
  const lines = raw.split("\n");

  let currentSpeaker = "Speaker";
  let currentText = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentText) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim() });
        currentText = "";
      }
      continue;
    }

    const speakerMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9 .'-]{0,38}):\s*(.+)/);
    if (speakerMatch) {
      if (currentText) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim() });
      }
      currentSpeaker = speakerMatch[1].trim();
      currentText = speakerMatch[2];
    } else {
      currentText += " " + trimmed;
    }
  }

  if (currentText.trim()) {
    segments.push({ speaker: currentSpeaker, text: currentText.trim() });
  }

  if (segments.length === 0 && raw.trim().length > 0) {
    const chunks = raw.match(/[^.!?]+[.!?]+/g) || [raw];
    for (const chunk of chunks.slice(0, 500)) {
      segments.push({ speaker: "Speaker", text: chunk.trim() });
    }
  }

  return segments;
}

function parseTimestamp(ts: string): number {
  const cleaned = ts.replace(",", ".");
  const parts = cleaned.split(":");
  if (parts.length === 3) {
    return (
      parseFloat(parts[0]) * 3600000 +
      parseFloat(parts[1]) * 60000 +
      parseFloat(parts[2]) * 1000
    );
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60000 + parseFloat(parts[1]) * 1000;
  }
  return 0;
}

function extractSpeakers(segments: Segment[]): string[] {
  return [...new Set(segments.map((s) => s.speaker))];
}

function buildSummaryFromSegments(segments: Segment[], raw: string): string {
  if (segments.length === 0) {
    return raw.slice(0, 500) + (raw.length > 500 ? "..." : "");
  }
  const preview = segments
    .slice(0, 10)
    .map((s) => `${s.speaker}: ${s.text}`)
    .join("\n");
  return `Transcript with ${segments.length} segments from ${extractSpeakers(segments).length} speaker(s).\n\n${preview}`;
}
