import { useSyncExternalStore } from "react";

import { CollaborationPage } from "./pages/Collaboration";
import { HomePage } from "./pages/Home";
import { SSRPage } from "./pages/SSR";

type PageId = "home" | "collaboration" | "ssr";

function getPageId(): PageId {
	const hash = window.location.hash.replace(/^#\/?/, "");
	if (hash === "collaboration") return "collaboration";
	if (hash === "ssr") return "ssr";
	return "home";
}

function subscribe(onStoreChange: () => void) {
	window.addEventListener("hashchange", onStoreChange);
	return () => window.removeEventListener("hashchange", onStoreChange);
}

export function App() {
	const page = useSyncExternalStore(subscribe, getPageId, () => "home");

	return (
		<div className="docs-shell">
			<header className="docs-header">
				<a className="docs-brand" href="#/">
					Pen
				</a>
				<nav className="docs-nav">
					<a href="#/" aria-current={page === "home" ? "page" : undefined}>
						Home
					</a>
					<a
						href="#/collaboration"
						aria-current={page === "collaboration" ? "page" : undefined}
					>
						Collaboration
					</a>
					<a href="#/ssr" aria-current={page === "ssr" ? "page" : undefined}>
						SSR
					</a>
				</nav>
			</header>
			<main className="docs-main">
				{page === "collaboration" ? (
					<CollaborationPage />
				) : page === "ssr" ? (
					<SSRPage />
				) : (
					<HomePage />
				)}
			</main>
		</div>
	);
}
