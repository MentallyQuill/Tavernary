"use client";

import Link from "next/link";
import { useEffect } from "react";

export function menuPathForLegacyHelpLocation(
  pathname: string,
  search: string,
  hash: string,
) {
  return `${pathname.replace(/\/help(?=\/|$)/u, "/menu")}${search}${hash}`;
}

export function LegacyMenuRedirect() {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    window.location.replace(
      menuPathForLegacyHelpLocation(pathname, search, hash),
    );
  }, []);

  return (
    <div className="site-shell">
      <main
        className="help-page help-page-narrow"
        data-menu-legacy-redirect="true"
      >
        <section className="help-hero">
          <p className="eyebrow">Menu</p>
          <h1>This page has moved</h1>
          <p>Tavernary is taking you to the same place in the Menu.</p>
          <Link className="primary-action" href="/menu/">
            Open the Menu
          </Link>
        </section>
      </main>
    </div>
  );
}
