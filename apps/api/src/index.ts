import { Hono } from "hono";
import { cors } from "hono/cors";
import upload from "./routes/upload";
import storageRoute from "./routes/storage";
import download from "./routes/download";
import apiKeys from "./routes/api-keys";
import health from "./routes/health";
import logger, { serializeError } from "./utils/logger";
import invalidateRoute from "./routes/invalidate";
import { apiKeyAuth } from "./middleware/auth";
import { publicRateLimit } from "./middleware/rate-limit";

const app = new Hono();

// CORS - Allow credentials for session cookies
app.use(
  "/*",
  cors({
    origin: (origin) => {
      // Allow requests from Next.js app or configured origins
      const allowedOrigins = [
        "http://localhost:3001", // Next.js dev
        "http://localhost:3000", // API itself
        process.env.CORS_ORIGIN,
      ].filter(Boolean);

      if (!origin || allowedOrigins.includes("*")) {
        return origin || "*";
      }

      return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    credentials: true, // Important: allow cookies
    exposeHeaders: ["Set-Cookie"],
  })
);

// Public routes (no authentication required)
// Rate limiting is applied to these routes only (protected routes have their own rate limiting via better-auth)

// Root endpoint
app.get("/", publicRateLimit, (c) => c.text("Openinary API Server is running."));

// Health check routes
app.use("/health", publicRateLimit);
app.use("/health/*", publicRateLimit);
app.route("/health", health);

// Original file download route (public — consistent with /t/)
app.use("/download", publicRateLimit);
app.use("/download/*", publicRateLimit);
app.route("/download", download);

// Protected routes - require API key authentication
// Apply middleware before routing
app.use("/upload/*", apiKeyAuth);
app.route("/upload", upload);

app.use("/storage/*", apiKeyAuth);
app.route("/storage", storageRoute);

// Cache invalidation route (protected)
app.use("/invalidate/*", apiKeyAuth);
app.route("/invalidate", invalidateRoute);

// API key management routes (also protected)
app.route("/api-keys", apiKeys);

export default app;
