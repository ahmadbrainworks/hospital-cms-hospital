/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: [
      "mongodb",
      "@hospital-cms/database",
      "@hospital-cms/errors",
      "@hospital-cms/config",
      "@hospital-cms/theme-engine",
      "@hospital-cms/plugin-runtime",
      "@hospital-cms/audit",
      "@hospital-cms/auth",
      "@hospital-cms/crypto",
      "@hospital-cms/crypto-vendor",
      "redis",
      "bcryptjs",
      "pino",
      "pino-pretty",
    ],
  },
};

export default nextConfig;
