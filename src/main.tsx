import { router } from "./router";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import "./fonts.css";
import "./globals.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found in the document.");
}

createRoot(container).render(<RouterProvider router={router} />);
