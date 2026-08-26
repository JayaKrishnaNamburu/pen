import { createRoot } from "react-dom/client";
import { PEN_REVIEW_STYLESHEET } from "@input/pen-dom";
import { App } from "./App";

import "./styles/tokens.css";
import "./app.css";
import "./ui/ui.css";
import "./editor/editor.css";
import "./chat/chat.css";
import "./inspector/inspector.css";

// RS4: the review surface's rule blocks come from Pen, not from this app. The
// playground themes them through the custom properties in `editor.css`. It goes
// in first so app stylesheets win on equal specificity.
const reviewStyles = document.createElement("style");
reviewStyles.dataset.penReviewStylesheet = "";
reviewStyles.textContent = PEN_REVIEW_STYLESHEET;
document.head.prepend(reviewStyles);

const container = document.getElementById("root");
if (!container) {
	throw new Error("Missing #root element in index.html");
}

createRoot(container).render(<App />);
