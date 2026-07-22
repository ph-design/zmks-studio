import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./i18n";

import { Download } from "./DownloadPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Download />
  </StrictMode>,
);
