/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // `domains` was removed in Next 15; remotePatterns is the stricter replacement.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "storage.medplum.com",
      },
    ],
  },
  // @lastehr/mcp is built for NodeNext, so its internal imports carry the
  // required ".js" extension. The app compiles that package's chart-read core
  // from source (it is the single source of truth for both surfaces), so the
  // bundler needs the same extension mapping TypeScript already does.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
  async headers() {
    const securityHeaders = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
