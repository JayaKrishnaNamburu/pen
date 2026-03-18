import { useEffect, useMemo, useState } from "react";
import {
  defaultPageId,
  sitePages,
  siteSections,
  type SitePage,
} from "./content/siteContent";

const pageIds = new Set(sitePages.map((page) => page.id));
const docsUtilityLinks = [
  {
    href: "https://github.com/lemni/pen",
    label: "GitHub",
  },
  {
    href: "https://github.com/lemni/pen/blob/main/README.md",
    label: "README",
  },
  {
    href: "https://github.com/lemni/pen/tree/main/spec",
    label: "Specs",
  },
] as const;
const docsTopNavItems = ["Docs", "Examples", "Guides"] as const;

function resolvePageId(hash: string): string {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  return pageIds.has(normalizedHash) ? normalizedHash : defaultPageId;
}

export function App() {
  const [currentPageId, setCurrentPageId] = useState(() =>
    resolvePageId(window.location.hash),
  );

  const currentPage = useMemo(() => {
    return (
      sitePages.find((page) => page.id === currentPageId) ??
      sitePages.find((page) => page.id === defaultPageId) ??
      sitePages[0]
    );
  }, [currentPageId]);

  const currentSection = useMemo(() => {
    return siteSections.find((section) => section.id === currentPage.sectionId);
  }, [currentPage.sectionId]);

  const pageGroups = useMemo(() => {
    return siteSections.map((section) => {
      return {
        section,
        pages: sitePages.filter((page) => page.sectionId === section.id),
      };
    });
  }, []);

  const handlePageSelect = (pageId: string) => {
    if (window.location.hash !== `#${pageId}`) {
      window.location.hash = pageId;
    }
    setCurrentPageId(pageId);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  useEffect(() => {
    const nextPageId = resolvePageId(window.location.hash);
    if (window.location.hash !== `#${nextPageId}`) {
      window.history.replaceState(null, "", `#${nextPageId}`);
    }
    setCurrentPageId(nextPageId);

    const handleHashChange = () => {
      setCurrentPageId(resolvePageId(window.location.hash));
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const navGroups = pageGroups.map((group) => {
    const pageButtons = group.pages.map((page) => {
      const isActive = page.id === currentPage.id;

      return (
        <button
          key={page.id}
          type="button"
          className={isActive ? "docs-nav-link is-active" : "docs-nav-link"}
          onClick={() => handlePageSelect(page.id)}
        >
          <span className="docs-nav-link-title">{page.title}</span>
        </button>
      );
    });

    return (
      <section key={group.section.id} className="docs-nav-group">
        <h2>{group.section.title}</h2>
        <div className="docs-nav-links">{pageButtons}</div>
      </section>
    );
  });

  const topbarLink = docsUtilityLinks[0];
  const railLinkItems = docsUtilityLinks.slice(1).map((link) => {
    return (
      <a
        key={link.href}
        className="docs-rail-utility-link"
        href={link.href}
        target="_blank"
        rel="noreferrer"
      >
        {link.label}
      </a>
    );
  });

  const currentSectionLabel = currentSection
    ? `${currentSection.title} section`
    : "Documentation";
  const currentSectionPages =
    pageGroups.find((group) => group.section.id === currentPage.sectionId)?.pages ?? [];

  const topNavItems = docsTopNavItems.map((item) => {
    const isActive = item === "Docs";

    return (
      <button
        key={item}
        type="button"
        className={isActive ? "docs-top-nav-item is-active" : "docs-top-nav-item"}
      >
        {item}
      </button>
    );
  });

  const sectionRailItems = currentSectionPages.map((page) => {
    const isActive = page.id === currentPage.id;

    return (
      <button
        key={page.id}
        type="button"
        className={isActive ? "docs-rail-link is-active" : "docs-rail-link"}
        onClick={() => handlePageSelect(page.id)}
      >
        {page.title}
      </button>
    );
  });

  const article = renderArticle(currentPage, currentSection?.title ?? "Docs");

  return (
    <div className="docs-shell">
      <aside className="docs-sidebar">
        <div className="docs-sidebar-header">
          <div className="docs-sidebar-brand">
            <span className="docs-sidebar-brand-mark" />
            <span className="docs-sidebar-brand-name">Pen</span>
          </div>
          <span className="docs-eyebrow">Current Surface</span>
          <h1>Shipped editor docs</h1>
        </div>
        <nav aria-label="Documentation navigation">{navGroups}</nav>
      </aside>
      <main className="docs-main">
        <div className="docs-topbar">
          <div className="docs-topbar-copy">
            <span className="docs-topbar-label">Pen</span>
            <span className="docs-topbar-subtitle">{currentSectionLabel}</span>
          </div>
          <div className="docs-top-nav">{topNavItems}</div>
          <a
            className="docs-topbar-action"
            href={topbarLink.href}
            target="_blank"
            rel="noreferrer"
          >
            {topbarLink.label}
          </a>
        </div>
        <div className="docs-main-grid">
          <section className="docs-content-column">
            <header className="docs-main-header">
              <div>
                <span className="docs-section-label">
                  {currentSection?.title ?? "Documentation"}
                </span>
                <h1>{currentPage.title}</h1>
                <p>{currentPage.summary}</p>
              </div>
            </header>
            {article}
          </section>
          <aside className="docs-rail">
            <div className="docs-rail-panel">
              <span className="docs-rail-label">On this page</span>
              <div className="docs-rail-links">{sectionRailItems}</div>
            </div>
            <div className="docs-rail-card">
              <span className="docs-rail-card-label">Resources</span>
              <strong>Repository links</strong>
              <p>
                README and architecture specs for the current shipped Pen surface.
              </p>
              <div className="docs-rail-card-links">{railLinkItems}</div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function renderArticle(page: SitePage, sectionTitle: string) {
  return (
    <article className="docs-article">
      <div className="docs-article-meta">
        <span>{sectionTitle}</span>
      </div>
      <div className="docs-article-body">{page.content}</div>
    </article>
  );
}
