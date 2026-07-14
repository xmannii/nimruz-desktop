import { createRoot } from "react-dom/client";
import App from "./App";
import "./fonts.css";
import "./globals.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found in the document.");
}

createRoot(container).render(<App />);
