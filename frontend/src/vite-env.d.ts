/// <reference types="vite/client" />

// Typed env so a typo like `import.meta.env.VITE_API_ULR` is a compile error.
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
