import { getRedis, log } from "@rex/shared";
import { REX_DEAD_LETTER_KEY } from "./events";

export interface DeadLetterEntry {
  event: string;
  error: string;
  handler: string;
  failedAt: string;
  retryCount: number;
}

export async function pushToDeadLetter(entry: DeadLetterEntry): Promise<void> {
  const redis = getRedis();
  await redis.lpush(REX_DEAD_LETTER_KEY, JSON.stringify(entry));

  log({
    level: "error",
    message: `Event sent to dead letter queue: ${entry.handler}`,
    service: "orchestrator",
    meta: { error: entry.error, retryCount: entry.retryCount },
  });
}

export async function getDeadLetterEntries(
  limit = 50
): Promise<DeadLetterEntry[]> {
  const redis = getRedis();
  const entries = await redis.lrange(REX_DEAD_LETTER_KEY, 0, limit - 1);
  return entries.map((e) => JSON.parse(e) as DeadLetterEntry);
}

export async function clearDeadLetterQueue(): Promise<number> {
  const redis = getRedis();
  const count = await redis.llen(REX_DEAD_LETTER_KEY);
  await redis.del(REX_DEAD_LETTER_KEY);
  return count;
}
