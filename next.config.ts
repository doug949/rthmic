import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_RTHMIC_BUILD:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
      process.env.NEXT_PUBLIC_RTHMIC_BUILD ??
      "dev",
    NEXT_PUBLIC_RTHMIC_DEPLOYMENT:
      process.env.VERCEL_DEPLOYMENT_ID ??
      process.env.NETLIFY_DEPLOY_ID ??
      process.env.NEXT_PUBLIC_RTHMIC_DEPLOYMENT ??
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
      "dev",
  },
  // Allow audio from Wasabi S3
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
