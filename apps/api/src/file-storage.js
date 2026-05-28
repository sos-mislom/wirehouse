import fs from "node:fs";
import path from "node:path";

import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const createFileStorage = (config) => {
  if (config.fileStorageDriver !== "s3") {
    return {
      driver: "local",
      keyFor: (kind, storedName) => path.join(kind === "documents" ? config.documentStoragePath : config.ticketAttachmentStoragePath, path.basename(storedName)),
      async put({ key, content }) {
        fs.mkdirSync(path.dirname(key), { recursive: true });
        fs.writeFileSync(key, content);
      },
      async get({ key }) {
        if (!fs.existsSync(key)) {
          return null;
        }
        return fs.readFileSync(key);
      },
      async exists({ key }) {
        return fs.existsSync(key);
      },
      async delete({ key }) {
        if (fs.existsSync(key)) {
          fs.unlinkSync(key);
        }
      },
      async check() {
        return {
          ok: true,
          driver: "local",
          message: "Local file storage is writable",
          details: {
            documentsPath: config.documentStoragePath,
            ticketAttachmentsPath: config.ticketAttachmentStoragePath
          }
        };
      },
      isSafeKey(key, kind) {
        const storageRoot = path.resolve(kind === "documents" ? config.documentStoragePath : config.ticketAttachmentStoragePath);
        const resolved = path.resolve(key);
        return resolved === storageRoot || resolved.startsWith(`${storageRoot}${path.sep}`);
      }
    };
  }

  const client = new S3Client({
    region: config.s3Region,
    endpoint: config.s3Endpoint || undefined,
    forcePathStyle: config.s3ForcePathStyle,
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey
    }
  });

  return {
    driver: "s3",
    keyFor: (kind, storedName) => `${kind}/${path.basename(storedName)}`,
    async put({ key, content, contentType }) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.s3Bucket,
          Key: key,
          Body: content,
          ContentType: contentType || "application/octet-stream"
        })
      );
    },
    async get({ key }) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }));
        return streamToBuffer(result.Body);
      } catch (error) {
        if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
          return null;
        }
        throw error;
      }
    },
    async exists({ key }) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.s3Bucket, Key: key }));
        return true;
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404) {
          return false;
        }
        throw error;
      }
    },
    async delete({ key }) {
      await client.send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: key }));
    },
    async check() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
        return {
          ok: true,
          driver: "s3",
          message: "S3 bucket is reachable",
          details: {
            endpoint: config.s3Endpoint || "aws",
            region: config.s3Region,
            bucket: config.s3Bucket
          }
        };
      } catch (error) {
        return {
          ok: false,
          driver: "s3",
          message: error instanceof Error ? error.message : "S3 bucket check failed",
          details: {
            endpoint: config.s3Endpoint || "aws",
            region: config.s3Region,
            bucket: config.s3Bucket
          }
        };
      }
    },
    isSafeKey(key) {
      return !String(key).includes("..") && !String(key).startsWith("/");
    }
  };
};
