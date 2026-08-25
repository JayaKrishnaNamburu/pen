import { createRoot } from "react-dom/client";
import { App } from "./App";

import "./styles/tokens.css";
import "./app.css";
import "./ui/ui.css";
import "./editor/editor.css";
import "./chat/chat.css";
import "./inspector/inspector.css";

const container = document.getElementById("root");
if (!container) {
	throw new Error("Missing #root element in index.html");
}

createRoot(container).render(<App />);
