#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "redis";

function loadEnvFile(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  } catch {
    // Optional local env file.
  }
}

function makeBetaCode() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let suffix = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const byte of bytes) suffix += chars[byte % chars.length];
  return `rthm-${suffix}`;
}

function normaliseEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: node scripts/issue-beta-code.mjs email@example.com [optional-code]");
  }
  return email;
}

function normaliseCode(value) {
  const code = String(value ?? "").trim().toLowerCase();
  if (code && !/^[a-z0-9][a-z0-9-]{3,48}$/.test(code)) {
    throw new Error("Code must be 4-49 chars, lowercase letters/numbers/hyphens.");
  }
  return code || makeBetaCode();
}

loadEnvFile(path.join(process.cwd(), ".env.local"));

const email = normaliseEmail(process.argv[2]);
const code = normaliseCode(process.argv[3]);

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is not set. Pull env vars or run from a configured environment.");
}

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

try {
  const key = `beta-code:${code}`;
  const exists = await client.exists(key);
  if (exists) throw new Error(`Code already exists: ${code}`);

  const entry = JSON.stringify({
    email,
    createdAt: Date.now(),
    source: "manual",
  });

  await client
    .multi()
    .set(key, entry)
    .set(`access-request:${email}`, JSON.stringify({ email, requestedAt: Date.now(), source: "manual" }))
    .lPush("access-requests", email)
    .lTrim("access-requests", 0, 499)
    .exec();

  console.log(`Issued beta code for ${email}: ${code}`);
} finally {
  await client.disconnect();
}
