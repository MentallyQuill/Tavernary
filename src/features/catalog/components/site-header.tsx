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
    <header className="site-header">
      <div
        className="site-utility-strip"
        role="group"
        aria-label="Site utilities"
      >
        <a
          aria-labelledby="tavernary-companion-label"
          aria-describedby="tavernary-companion-description"
          className="companion-utility-link"
          href="https://github.com/MentallyQuill/TavernaryCompanion"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span aria-hidden="true" className="companion-utility-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 7h4a3 3 0 1 1 6 0h4v4a3 3 0 1 1 0 6v4h-4a3 3 0 1 0-6 0H4v-4a3 3 0 1 1 0-6V7Z" />
            </svg>
          </span>
          <span
            id="tavernary-companion-label"
            className="companion-utility-label"
          >
            Tavernary Companion
          </span>
          <svg
            aria-hidden="true"
            className="companion-utility-arrow"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17 17 7M7 7h10v10" />
          </svg>
          <span
            id="tavernary-companion-description"
            className="companion-utility-description"
          >
            Extension for SillyTavern and ST-compatible frontends.
          </span>
        </a>
        <ColorModeSwitch />
      </div>
      <div className="site-header-main">
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
            <span className="brand-tagline">
              Where AI roleplay tools gather
            </span>
          </span>
        </Link>
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
      </div>
    </header>
  );
}
