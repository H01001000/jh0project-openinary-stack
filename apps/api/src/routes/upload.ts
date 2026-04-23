import { Hono } from "hono";
import { createStorageClient } from "../utils/storage/index";
import fs from "fs";
import path from "path";
import logger, { serializeError } from "../utils/logger";
import { getUniqueFilePath } from "../utils/get-unique-file-path";
import heicConvert from 'heic-convert';

const upload = new Hono();
const storage = createStorageClient();

// File size limit: configurable via MAX_FILE_SIZE_MB env var, defaults to 50MB
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB ?? "50", 10) || 50) * 1024 * 1024;

// Allowed file extensions and MIME types
const ALLOWED_TYPES = {
  // Images
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/gif": [".gif"],
  "image/heic" : ['.heic', '.heif'],
  "image/heif" : ['.heic', '.heif'],
  "image/vnd.adobe.photoshop": [".psd"],
  "application/octet-stream": [".psd"],
  // Videos
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/webm": [".webm"],
};

interface UploadResult {
  filename: string;
  path: string;
  size: number;
  url: string;
}

interface UploadError {
  filename: string;
  error: string;
}


/**
 * Sanitizes file path to prevent directory traversal attacks
 */
function sanitizePath(filepath: string): string {
  // Remove leading slashes and any parent directory references
  let sanitized = filepath.replace(/^\/+/, "").replace(/\.\./g, "");

  // Normalize path separators to forward slashes
  sanitized = sanitized.replace(/\\/g, "/");

  // Remove any remaining dangerous patterns
  sanitized = sanitized.replace(/\/+/g, "/"); // Multiple slashes

  return sanitized;
}

/**
 * Validates file type based on MIME type and extension
 */
function validateFileType(filename: string, mimeType: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  const allowedExtensions =
    ALLOWED_TYPES[mimeType as keyof typeof ALLOWED_TYPES];

  if (!allowedExtensions) {
    return false;
  }

  return allowedExtensions.includes(ext);
}

/**
 * Saves file to local storage (./public/)
 */
async function saveFileLocally(
  filePath: string,
  buffer: Buffer,
): Promise<void> {
  const fullPath = path.join("./public", filePath);
  const dir = path.dirname(fullPath);

  // Create parent directories if they don't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, buffer);
}

async function localFileExists(filePath: string): Promise<boolean> {
  const fullPath = path.join("./public", filePath);
  return fs.existsSync(fullPath);
}

async function normalizeUploadFormat(
  buffer: Buffer,
  mimeType: string,
  filePath: string,
): Promise<{ buffer: Buffer; mimeType: string; path: string, fileName: string }>{
  let normalizedBuffer;
  let normalizedMimeType;
  let normalizedPath;
  if (mimeType === "image/heic" || mimeType === "image/heif"){
    try{
      normalizedBuffer = await heicConvert({
                buffer: buffer as any,
                format: 'JPEG',
                quality: 1
      });

      normalizedMimeType = "image/jpeg";
      normalizedPath = filePath.replace(/\.(heic|heif)$/i, '.jpg');
    }catch {
      throw new Error(`Failed to convert file from ${mimeType} to image/jpeg`);
    }

  } else {
    normalizedBuffer = buffer;
    normalizedMimeType = mimeType;
    normalizedPath = filePath;
  }
  return {
      buffer: normalizedBuffer as any,
      mimeType : normalizedMimeType,
      path : normalizedPath,
      fileName : path.basename(normalizedPath)
  }
}

/**
 * POST /upload - Upload single or multiple files
 */
upload.post("/", async (c) => {
  try {
    const formData = await c.req.formData();
    const uploadFolder = formData.get("folder") as string | null;
    const files = formData.getAll("files");
    const customNames = formData.getAll("names");

    if (files.length === 0) {
      return c.json({ success: false, error: "No files provided" }, 400);
    }

    const successfulUploads: UploadResult[] = [];
    const failedUploads: UploadError[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!(file instanceof File)) {
        failedUploads.push({
          filename: "unknown",
          error: "Invalid file object",
        });
        continue;
      }

      // Get relative path if available (for folder uploads), otherwise use filename
      const customName = customNames[i] as string | undefined;
      const rawPath =
        (uploadFolder || "") +
        "/" +
        (customName || (file as any).webkitRelativePath || file.name);
      const rawSanitizedPath = sanitizePath(rawPath);
      const filename = path.basename(rawSanitizedPath);
      const mimeType = file.type;
      const fileSize = file.size;

      // Validate file size
      if (fileSize > MAX_FILE_SIZE) {
        failedUploads.push({
          filename: rawSanitizedPath,
          error: `File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB (size: ${(fileSize / 1024 / 1024).toFixed(2)}MB)`,
        });
        continue;
      }

      // Validate file type
      if (!validateFileType(filename, mimeType)) {
        failedUploads.push({
          filename: rawSanitizedPath,
          error: `Invalid file type: ${mimeType}. Allowed types: images (jpg, jpeg, png, webp, avif, gif, heic, heif, psd) and videos (mp4, mov, webm)`,
        });
        continue;
      }

      try {
        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const {
          buffer: normalizedBuffer, 
          mimeType: normalizedContentType, 
          path: normalizedPath, 
          fileName: normalizedFileName
        } = await normalizeUploadFormat(buffer, mimeType, rawSanitizedPath)

        // Compute a unique file path to avoid overwriting existing files
        let finalPath = normalizedPath;

        if (storage) {
          finalPath = await getUniqueFilePath(normalizedPath, async (p) =>
            storage.existsOriginalPath(p),
          );
        } else {
          finalPath = await getUniqueFilePath(
            normalizedPath,
            localFileExists,
          );
        }

        // Upload based on storage configuration
        if (storage) {
          // Upload to cloud storage with full (unique) path
          const url = await storage.uploadOriginal(
            finalPath,
            normalizedBuffer,
            normalizedContentType,
          );
          logger.info(
            { originalPath: rawSanitizedPath, finalPath, url },
            "Uploaded to cloud",
          );

          const uploadResult: UploadResult = {
            filename : normalizedFileName,
            path: finalPath,
            size: normalizedBuffer.length,
            url: `/download/${finalPath}`,
          };

          successfulUploads.push(uploadResult);
        } else {
          // Save locally with full path
          await saveFileLocally(finalPath, normalizedBuffer);
          logger.info(
            { originalPath: rawSanitizedPath, finalPath },
            "Saved locally",
          );

          const uploadResult: UploadResult = {
            filename : normalizedFileName,
            path: finalPath,
            size: normalizedBuffer.length,
            url: `/download/${finalPath}`,
          };

          successfulUploads.push(uploadResult);
        }
      } catch (error) {
        logger.error(
          { error: serializeError(error), originalPath: rawSanitizedPath },
          "Failed to upload",
        );
        failedUploads.push({
          filename: rawSanitizedPath,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Determine response status
    const allSuccessful = failedUploads.length === 0;
    const someSuccessful = successfulUploads.length > 0;

    if (allSuccessful) {
      return c.json({
        success: true,
        files: successfulUploads,
      });
    } else if (someSuccessful) {
      return c.json(
        {
          success: true,
          files: successfulUploads,
          errors: failedUploads,
        },
        207,
      ); // Multi-Status
    } else {
      return c.json(
        {
          success: false,
          errors: failedUploads,
        },
        400,
      );
    }
  } catch (error) {
    logger.error({ error: serializeError(error) }, "Upload error");
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/**
 * POST /upload/createfolder - create folder
 */
upload.post("/createfolder", async (c) => {
  try {
    const formData = await c.req.formData();
    const folder = formData.get("folder") as string | null;

    if (!folder || typeof folder !== "string") {
      logger.error({ folder }, "Invalid folder data provided");
      return c.json(
        {
          success: false,
          folder: null,
          error: "Invalid folder data provided",
        },
        400,
      );
    }

    const rawSanitizedPath = sanitizePath(folder.replaceAll(" ", "_")).replace(
      /\/+$/,
      "",
    );

    if (!rawSanitizedPath) {
      logger.error({ folder }, "Invalid folder data provided");
      return c.json(
        {
          success: false,
          folder: null,
          error: "Invalid folder data provided",
        },
        400,
      );
    }

    if (storage) {
      const alreadyExists = await storage.folderExists(rawSanitizedPath);

      if (alreadyExists) {
        logger.warn({ folder: rawSanitizedPath }, "Folder already exists");
        return c.json(
          {
            success: false,
            folder: null,
            error: "Folder already exists",
          },
          409,
        );
      }

      await storage.createFolder(rawSanitizedPath);
      logger.info({ folder: rawSanitizedPath }, "Folder marker created");

      return c.json(
        {
          success: true,
          folder: rawSanitizedPath,
          error: null,
        },
        201,
      );
    }

    const localBasePath = path.join(".", "public");
    const localPath = path.join(".", "public", rawSanitizedPath);

    if (!fs.existsSync(localBasePath)) {
      logger.error({ folder }, "Local storage path does not exist");
      return c.json(
        {
          success: false,
          folder: null,
          error: "Local storage path does not exist",
        },
        500,
      );
    }

    if (fs.existsSync(localPath)) {
      logger.warn({ folder: localPath }, "Folder already exists");
      return c.json(
        {
          success: false,
          folder: null,
          error: "Folder already exists",
        },
        409,
      );
    }

    fs.mkdirSync(localPath, { recursive: true });
    logger.info({ folder: localPath }, "Folder created");
    return c.json(
      {
        success: true,
        folder: rawSanitizedPath,
        error: null,
      },
      201,
    );
  } catch (error) {
    logger.error({ error: serializeError(error) }, "Folder creation error");
    return c.json(
      {
        success: false,
        folder: null,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default upload;
