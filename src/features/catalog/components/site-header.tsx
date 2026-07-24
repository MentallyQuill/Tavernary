import Link from "next/link";

import { CategoryIcon } from "@/components/icons/category-icon";

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
      <Link className="brand" href="/" aria-label="Tavernary home">
        <span className="brand-mark" aria-hidden="true">
          <CategoryIcon name="feather" />
        </span>
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
          placeholder="Search projects"
          aria-label="Search projects"
        />
        <kbd>/</kbd>
      </label>
      <nav className="header-links" aria-label="Site links">
        <Link href="/about/">About</Link>
        <a href="#help">Help</a>
        <a className="submit-link" href="#submit">
          Submit Project
        </a>
      </nav>
    </header>
  );
}
