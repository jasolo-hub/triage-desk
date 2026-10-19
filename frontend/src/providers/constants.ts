// Single place the API base URL is read. Vite inlines `import.meta.env.VITE_*`
// at build time, so a missing value would silently ship `undefined/tickets`
// requests — fail loudly on startup instead (same "no silent fallback" rule as
// the backend env validation).
const apiUrl = import.meta.env.VITE_API_URL;
if (!apiUrl) {
  throw new Error("VITE_API_URL is not set (see frontend/.env.example)");
}

export const API_URL: string = apiUrl;
