import "./utils/dotenvx.js";
import type streamWeb from "node:stream/web";
import { GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import stream from "stream";
import { s3 } from "./utils/s3-client.js";

const app = express();
const port = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (req, res) => {
  res.sendStatus(200);
});

function requestHash(req: express.Request): string {
  const path = req.path;
  const acceptHeader = req.headers.accept ?? "";

  return crypto
    .createHash("sha256")
    .update(path + acceptHeader)
    .digest("hex");
}

app.get("/unsafe/*splat", async (req, res) => {
  const hash = requestHash(req);

  const s3Result = await s3
    .send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: hash,
      }),
    )
    .catch((e) => {
      if (e instanceof NoSuchKey) {
        console.info("Cache miss for key:", hash);
        return undefined;
      }
      console.error(e);
      return undefined;
    });

  if (s3Result) {
    if (s3Result.ContentType)
      res.setHeader("Content-Type", s3Result.ContentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    (s3Result.Body as stream.Readable).pipe(res);
    console.info("Cache hit for key:", hash);
    return;
  }

  const imgproxyResult = await fetch(`${process.env.IMGPROXY_URL}${req.path}`, {
    headers: {
      Accept: req.headers.accept ?? "",
    },
  });

  if (!imgproxyResult.ok || imgproxyResult.body === null) {
    res.sendStatus(imgproxyResult.status);
    return;
  }

  const imageStream = stream.Readable.fromWeb(
    imgproxyResult.body as streamWeb.ReadableStream,
  );

  res.setHeader(
    "Content-Type",
    imgproxyResult.headers.get("Content-Type") ?? "",
  );
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  imageStream.pipe(new stream.PassThrough()).pipe(res);

  const uploadToS3 = new Upload({
    client: s3,
    params: {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: hash,
      Body: imageStream.pipe(new stream.PassThrough()),
      ContentType: imgproxyResult.headers.get("Content-Type") ?? undefined,
    },
  });

  await uploadToS3
    .done()
    .then(() => {
      console.info("Cached image with key:", hash);
    })
    .catch((e) => {
      console.error(e);
    });
});

app.listen(port, () => console.log("API Magic happening on port " + port));
