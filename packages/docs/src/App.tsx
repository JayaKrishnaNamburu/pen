import { useSyncExternalStore } from "react";

import { AIPage } from "./pages/AI";
import { AccessibilityPage } from "./pages/Accessibility";
import { CollaborationPage } from "./pages/Collaboration";
import { CommandsPage } from "./pages/Commands";
import { CoreConceptsPage } from "./pages/CoreConcepts";
import { ExtensionsPage } from "./pages/Extensions";
import { GettingStartedPage } from "./pages/GettingStarted";
import { HomePage } from "./pages/Home";
import { ImportExportPage } from "./pages/ImportExport";
import { LocalizationPage } from "./pages/Localization";
import { SSRPage } from "./pages/SSR";
import { SecurityPage } from "./pages/Security";
import { SelectionPage } from "./pages/Selection";
import { SupportPage } from "./pages/Support";
import { UpgradePage } from "./pages/Upgrade";

type PageId =
	| "home"
	| "getting-started"
	| "core-concepts"
	| "selection"
	| "extensions"
	| "commands"
	| "collaboration"
	| "ai"
	| "import-export"
	| "security"
	| "accessibility"
	| "support"
	| "localization"
	| "upgrade"
	| "ssr";

const NAV_ITEMS: { id: PageId; href: string; label: string }[] = [
	{ id: "home", href: "#/", label: "Home" },
	{ id: "getting-started", href: "#/getting-started", label: "Getting started" },
	{ id: "core-concepts", href: "#/core-concepts", label: "Core concepts" },
	{ id: "selection", href: "#/selection", label: "Selection" },
	{ id: "extensions", href: "#/extensions", label: "Extensions" },
	{ id: "commands", href: "#/commands", label: "Commands" },
	{ id: "collaboration", href: "#/collaboration", label: "Collaboration" },
	{ id: "ai", href: "#/ai", label: "AI" },
	{ id: "import-export", href: "#/import-export", label: "Import/export" },
	{ id: "security", href: "#/security", label: "Security" },
	{ id: "accessibility", href: "#/accessibility", label: "Accessibility" },
	{ id: "support", href: "#/support", label: "Support" },
	{ id: "localization", href: "#/localization", label: "Localization" },
	{ id: "upgrade", href: "#/upgrade", label: "Upgrade" },
	{ id: "ssr", href: "#/ssr", label: "SSR" },
];

function getPageId(): PageId {
	const hash = window.location.hash.replace(/^#\/?/, "");
	switch (hash) {
		case "getting-started":
			return "getting-started";
		case "core-concepts":
			return "core-concepts";
		case "selection":
			return "selection";
		case "extensions":
			return "extensions";
		case "commands":
			return "commands";
		case "collaboration":
			return "collaboration";
		case "ai":
			return "ai";
		case "import-export":
			return "import-export";
		case "security":
			return "security";
		case "accessibility":
			return "accessibility";
		case "support":
			return "support";
		case "localization":
			return "localization";
		case "upgrade":
			return "upgrade";
		case "ssr":
			return "ssr";
		default:
			return "home";
	}
}

function renderPage(page: PageId) {
	switch (page) {
		case "home":
			return <HomePage />;
		case "getting-started":
			return <GettingStartedPage />;
		case "core-concepts":
			return <CoreConceptsPage />;
		case "selection":
			return <SelectionPage />;
		case "extensions":
			return <ExtensionsPage />;
		case "commands":
			return <CommandsPage />;
		case "collaboration":
			return <CollaborationPage />;
		case "ai":
			return <AIPage />;
		case "import-export":
			return <ImportExportPage />;
		case "security":
			return <SecurityPage />;
		case "accessibility":
			return <AccessibilityPage />;
		case "support":
			return <SupportPage />;
		case "localization":
			return <LocalizationPage />;
		case "upgrade":
			return <UpgradePage />;
		case "ssr":
			return <SSRPage />;
		default: {
			const exhaustive: never = page;
			return exhaustive;
		}
	}
}

function subscribe(onStoreChange: () => void) {
	window.addEventListener("hashchange", onStoreChange);
	return () => window.removeEventListener("hashchange", onStoreChange);
}

export function App() {
	const page = useSyncExternalStore(subscribe, getPageId, (): PageId => "home");
	const navLinks = NAV_ITEMS.map((item) => (
		<a
			key={item.id}
			href={item.href}
			aria-current={page === item.id ? "page" : undefined}
		>
			{item.label}
		</a>
	));

	return (
		<div className="docs-shell">
			<header className="docs-header">
				<a className="docs-brand" href="#/">
					Pen
				</a>
				<nav className="docs-nav">{navLinks}</nav>
			</header>
			<main className="docs-main">{renderPage(page)}</main>
		</div>
	);
}
