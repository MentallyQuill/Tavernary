import Image from "next/image";
import Link from "next/link";

import { CategoryIcon } from "@/components/icons/category-icon";
import { KoFiSupport } from "@/features/catalog/components/kofi-support";

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
      <label className="site-search">
        <CategoryIcon name="search" />
        <span className="visually-hidden">Search projects</span>
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search projects or creators…"
          aria-label="Search projects"
        />
        <kbd>/</kbd>
      </label>
      <nav className="header-actions" aria-label="Site actions">
        <a className="top-link about-link" href="./about/">
          About
        </a>
        <Link className="top-link help-link" href="/help/">
          Help
        </Link>
        <Link className="submit-link" href="/submit/project/">
          Submit Project
        </Link>
        <KoFiSupport />
      </nav>
    </header>
  );
}
