import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // antd + Refine make one ~1.1 MB (≈350 kB gzip) bundle. For a logged-in
    // internal admin that is acceptable; route-level code splitting is a
    // "more time" item, so raise the limit instead of shipping a warning.
    chunkSizeWarningLimit: 1500,
  },
});
