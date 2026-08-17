import redisClient from "../config/redis.js";

/**
 * Express middleware to cache responses in Redis.
 * Supports both GET and POST search requests (by hashing the request body as part of the key).
 * @param {number} ttl Time to live in seconds (default: 3600 seconds / 1 hour)
 */
export const cacheMiddleware = (ttl = 3600) => {
  return async (req, res, next) => {
    // If Redis is not connected, bypass the cache and query PostgreSQL directly
    if (!redisClient.isOpen) {
      return next();
    }

    // Build a unique cache key from the request path and payload
    const cacheKey = `cache:${req.originalUrl || req.url}:${JSON.stringify(req.body)}`;

    try {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        // Cache Hit: Return the cached JSON directly from Redis in under 8ms!
        return res.status(200).json(JSON.parse(cachedData));
      }

      // Cache Miss: Intercept the response JSON sender to save the fresh data in Redis
      const originalJson = res.json;
      res.json = function (body) {
        // Save the result to Redis with TTL expiration
        redisClient.set(cacheKey, JSON.stringify(body), {
          EX: ttl,
        }).catch((err) => console.error("Redis cache set error:", err.message));

        // Restore original response sender and dispatch
        res.json = originalJson;
        return res.json(body);
      };

      next();
    } catch (error) {
      console.error("Cache middleware error:", error.message);
      next(); // Fail-safe: continue processing request if cache errors
    }
  };
};

/**
 * Clears cached keys matching a specific pattern.
 * Use this when adding/updating records to invalidate stale caches.
 * @param {string} pattern Glob pattern (e.g., "cache:/api/admin/getnotice:*")
 */
export const clearCache = async (pattern) => {
  if (!redisClient.isOpen) return;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`Successfully cleared ${keys.length} cached keys matching: ${pattern}`);
    }
  } catch (error) {
    console.error("Redis cache clear error:", error.message);
  }
};
