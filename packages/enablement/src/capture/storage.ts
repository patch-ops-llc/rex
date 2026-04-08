import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { log } from "@rex/shared";

const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || join(process.cwd(), "public", "screenshots");

export async function saveScreenshot(
  walkthroughId: string,
  stepOrder: number,
  buffer: Buffer
): Promise<string> {
  const dir = join(SCREENSHOTS_DIR, walkthroughId);
  await mkdir(dir, { recursive: true });

  const filename = `step-${String(stepOrder).padStart(3, "0")}.png`;
  const filePath = join(dir, filename);

  await writeFile(filePath, buffer);

  // Return a URL-friendly path relative to the public directory
  const publicPath = `/screenshots/${walkthroughId}/${filename}`;

  log({
    level: "info",
    message: `Saved screenshot: ${publicPath}`,
    service: "enablement",
    meta: { walkthroughId, stepOrder },
  });

  return publicPath;
}

export async function saveAllScreenshots(
  walkthroughId: string,
  screenshots: Array<{ stepOrder: number; buffer: Buffer }>
): Promise<Map<number, string>> {
  const urlMap = new Map<number, string>();

  for (const { stepOrder, buffer } of screenshots) {
    const url = await saveScreenshot(walkthroughId, stepOrder, buffer);
    urlMap.set(stepOrder, url);
  }

  return urlMap;
}
