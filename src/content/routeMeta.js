// Served <title> and meta description for each public route, written into the
// prerendered route files at build time (vite.config.js routePrerenderPlugin).
// Without this every route shipped the homepage's title and description, so
// search results showed six identical listings. "/" keeps index.html's own.
// scripts/validate-cloudflare-production-build.mjs fails the build if a public
// route is missing here or two public routes share a title.
export const ROUTE_META = {
  "/about": {
    title: "How myBishBash works: a pause before the app opens",
    description:
      "myBishBash places a small App Prompt in front of the apps you open without thinking. Choose to do something else, or carry on. The prompt comes from you, not an algorithm.",
  },
  "/download": {
    title: "Get myBishBash: invite-only access",
    description:
      "myBishBash is invite-only for now. Enter your access code to install it on iPhone or Android, or join the waitlist.",
  },
  "/early-access": {
    title: "Join the myBishBash early list",
    description:
      "Tell us a little about you and we will let you know when myBishBash launches in your area. Takes about 30 seconds.",
  },
  "/invite": {
    title: "Your myBishBash invite: enter your access code",
    description:
      "myBishBash is invite-only for now. Enter your access code to install it on iPhone or Android, or join the waitlist.",
  },
  "/privacy": {
    title: "Privacy Policy | myBishBash",
    description: "The myBishBash Privacy Policy: how the app handles your data and the choices you have.",
  },
  "/terms": {
    title: "Terms of Use | myBishBash",
    description: "The Terms of Use that apply when you use myBishBash.",
  },
};
