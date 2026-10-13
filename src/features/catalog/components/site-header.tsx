import Image from "next/image";
import Link from "next/link";

import { CategoryIcon } from "@/components/icons/category-icon";
import { ColorModeSwitch } from "@/features/accessibility/components/color-mode-switch";
import { SearchHelp } from "@/features/search/components/search-help";

export function SiteHeader({
  search,
  onSearch,
  searchRef,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <header className="site-header site-header-with-companion">
      <Link
        className="brand"
        href="/"
        aria-label="Tavernary home"
        onContextMenu={(event) => event.preventDefault()}
      >
        <Image
          className="brand-logo"
          src="./tavernary-trihex.png"
          alt=""
          draggable={false}
          width={244}
          height={244}
          priority
          onContextMenu={(event) => event.preventDefault()}
        />
        <span className="brand-copy">
          <span className="brand-name">Tavernary</span>
          <span className="brand-tagline">Where AI roleplay tools gather</span>
        </span>
      </Link>
      <div className="site-search-controls">
        <div className="site-search" role="search">
          <CategoryIcon name="search" />
          <label className="visually-hidden" htmlFor="catalog-search">
            Search projects
          </label>
          <input
            id="catalog-search"
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search projects or creators…"
            aria-label="Search projects"
          />
          <kbd>/</kbd>
          <SearchHelp />
        </div>
        <ColorModeSwitch />
      </div>
      <a
        aria-labelledby="tavernary-companion-label"
        aria-describedby="tavernary-companion-description"
        className="companion-callout"
        href="https://github.com/MentallyQuill/TavernaryCompanion"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="companion-callout-copy">
          <span
            id="tavernary-companion-label"
            className="companion-callout-title"
          >
            Tavernary Companion
          </span>
          <span
            id="tavernary-companion-description"
            className="companion-callout-description"
          >
            Extension for SillyTavern and ST-compatible frontends.
          </span>
        </span>
        <span aria-hidden="true" className="companion-callout-arrow">
          ↗
        </span>
      </a>
      <nav className="header-actions" aria-label="Site actions">
        <a className="top-link about-link" href="./about/">
          About
        </a>
        <Link className="top-link menu-link" href="/menu/">
          Menu
        </Link>
        <Link className="submit-link" href="/submit/project/">
          Submit Project
        </Link>
      </nav>
    </header>
  );
}
