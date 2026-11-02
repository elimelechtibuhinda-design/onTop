import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative base so the build works on GitHub Pages sub-paths and any static host.
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "onTop — study tracker for students",
        short_name: "onTop",
        description: "Plan, focus and stay onTop of your studies. No sign-in; your data stays on your device.",
        theme_color: "#002145",
        background_color: "#002145",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        importScripts: ["sw-ping.js"],
        // Piano tracks are large, so they're cached the first time they play instead of up front.
        runtimeCaching: [{
          urlPattern: /\/music\/.*\.mp3$/,
          handler: "CacheFirst",
          options: {
            cacheName: "ontop-piano",
            rangeRequests: true,
            cacheableResponse: { statuses: [200] },
            expiration: { maxEntries: 20 }
          }
        }]
      }
    })
  ]
});
