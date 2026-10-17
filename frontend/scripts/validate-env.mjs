import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

if (!process.env.NEXT_PUBLIC_AMAP_KEY?.trim()) {
  console.error("Build aborted: NEXT_PUBLIC_AMAP_KEY is empty. Configure frontend/.env.local before deployment.");
  process.exit(1);
}

