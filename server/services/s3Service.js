import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Initialize S3 client if AWS credentials are provided in the environment variables
const s3Client = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  ? new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

/**
 * Parses a Base64 image string, uploads it to AWS S3 (or saves locally as a fallback),
 * and returns the public URL.
 * @param {string} base64String Raw base64 string from client
 * @returns {Promise<string>} Image URL or original string if not uploadable
 */
export const uploadImage = async (base64String) => {
  // If not a base64 string, return it as-is (e.g. empty string or already a URL)
  if (!base64String || !base64String.startsWith("data:image")) {
    return base64String;
  }

  try {
    // Parse content type and raw base64 data
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return base64String;
    }
    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    // Generate unique name for the file using UUID
    const extension = contentType.split("/")[1] || "png";
    const filename = `${crypto.randomUUID()}.${extension}`;

    // Mode A: Upload to AWS S3 if credentials and bucket are defined
    if (s3Client && process.env.AWS_S3_BUCKET) {
      const bucketName = process.env.AWS_S3_BUCKET;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: filename,
          Body: buffer,
          ContentType: contentType,
        })
      );
      return `https://${bucketName}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${filename}`;
    }

    // Mode B: Local dev fallback - save files inside a server/uploads folder
    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const localPath = path.join(uploadDir, filename);
    fs.writeFileSync(localPath, buffer);

    return `/uploads/${filename}`;
  } catch (error) {
    console.error("Error in uploadImage service:", error.message);
    return base64String; // Fallback to raw base64 if anything fails
  }
};
