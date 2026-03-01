import React from "react";
import { createRoot } from "react-dom/client";
import PopupApp from "./App.js";
import "./popup.css";

const container = document.getElementById("root");
if (!container) throw new Error("Could not find #root");

createRoot(container).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
