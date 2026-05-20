import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = "rthm-audio";

function makeS3(): S3Client {
  return new S3Client({
    region: "eu-west-1",
    endpoint: "https://s3.eu-west-1.wasabisys.com",
    credentials: {
      accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
      secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
}

// Download audio from a CDN URL and upload to Wasabi. Returns the S3 key.
// Throws on failure — caller should catch and fall back gracefully.
export async function uploadAudioToWasabi(
  sourceUrl: string,
  key: string
): Promise<string> {
  const s3 = makeS3();

  const res = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
      "Referer": "https://sunoapi.org/",
    },
  });
  if (!res.ok) throw new Error(`fetch ${sourceUrl} → ${res.status}`);

  const contentType = res.headers.get("Content-Type") ?? "audio/mpeg";
  const body = Buffer.from(await res.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return key;
}

// Get a signed URL for a Wasabi key (1 hour expiry).
export async function getWasabiSignedUrl(key: string): Promise<string> {
  const s3 = makeS3();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}
