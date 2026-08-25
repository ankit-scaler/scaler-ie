/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Without this, Next's client-side Router Cache serves a page visited (or
  // prefetched) in the last 30s from memory on the next Link navigation,
  // even though the server-side data (and its revalidateTag) is fresh — so
  // an admin edit made on /admin doesn't show up on /assignments (or
  // /, /packets) until that window passes. Every route here is already
  // force-dynamic, so there's no static-render benefit being traded away.
  experimental: { staleTimes: { dynamic: 0 } },
};
export default nextConfig;
