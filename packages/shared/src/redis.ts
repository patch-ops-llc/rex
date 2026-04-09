import Redis from "ioredis";

let redis: Redis | null = null;
let redisUnavailable = false;

function createConnection(url: string): Redis {
  const conn = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 500, 3000);
    },
  });

  conn.on("error", () => {
    // Suppress unhandled error events — callers handle failures via try/catch
  });

  return conn;
}

export function getRedis(): Redis | null {
  if (redisUnavailable) return null;

  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      redisUnavailable = true;
      return null;
    }

    redis = createConnection(url);
    redis.connect().catch(() => {
      redisUnavailable = true;
      redis = null;
    });

    redis.on("close", () => {
      redisUnavailable = true;
      redis = null;
    });
  }

  return redis;
}

export function createRedisSubscriber(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url || redisUnavailable) return null;

  const sub = createConnection(url);
  sub.connect().catch(() => {});
  return sub;
}
