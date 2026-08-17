import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Create the Redis client instance
const redisClient = createClient({
  url: redisUrl,
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err.message);
});

// Self-invoking async initializer to connect to Redis without blocking server startup
(async () => {
  try {
    await redisClient.connect();
    console.log("Connected to Redis Cache Server successfully.");
  } catch (error) {
    console.warn("Could not connect to Redis. Caching will run in bypass/fallback mode:", error.message);
  }
})();

export default redisClient;
