// antd 5 was written for React 16–18; on React 19 (what the Refine scaffold
// installs) antd's own docs require this patch so its static APIs
// (message/notification/Modal.confirm) and click effects keep working.
// Must be imported before anything renders antd.
import "@ant-design/v5-patch-for-react-19";
import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

const container = document.getElementById("root") as HTMLElement;
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
