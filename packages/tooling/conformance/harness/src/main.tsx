import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getHarnessSession } from "./session";
import "./styles.css";

getHarnessSession();

const root = document.getElementById("root");
if (!root) {
	throw new Error("conformance harness: #root is missing");
}

createRoot(root).render(<App />);
