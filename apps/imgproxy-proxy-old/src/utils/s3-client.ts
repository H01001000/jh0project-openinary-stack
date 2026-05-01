import "./dotenvx.js";
import { S3Client } from "@aws-sdk/client-s3";

const REGION = process.env.S3_DEFAULT_REGION;
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.S3_ENDPOINT_URL;

// Initialize S3 client
export const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY_ID!,
    secretAccessKey: SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
});
