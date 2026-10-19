import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // antd + Refine (tables, forms, upload, pickers) make one ~1.9 MB
    // (≈600 kB gzip) bundle. For a logged-in internal admin that is
    // acceptable; route-level code splitting (React.lazy per page) is a
    // "more time" item, so the limit is set just above today's size.
    chunkSizeWarningLimit: 2000,
  },
});
