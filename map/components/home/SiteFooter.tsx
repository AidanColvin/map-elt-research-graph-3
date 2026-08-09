"use client";

import { PROVENANCE_SOURCES } from "./provenanceSources";

/** Every record the reports draw on, credited by name and linked to its home. */
const ATTRIBUTIONS = [
  ...PROVENANCE_SOURCES.map((s) => ({ name: s.name, url: s.url })),
  { name: "Wikipedia", url: "https://www.wikipedia.org/" },
];

const REPO_URL = "https://github.com/AidanColvin/map-elt-research-graph-3";
const LICENSE_URL = "https://www.apache.org/licenses/LICENSE-2.0";

/**
 * takes every destination in the app and a handler for choosing one
 * renders the closing row — the independence disclaimer, the verification line,
 * the data credits, the license, the repository, and the full destination list
 * returns the footer element
 */
export default function SiteFooter({
  links,
  onNavigate,
}: {
  links: { key: string; label: string }[];
  onNavigate: (key: string) => void;
}) {
  return (
    <footer className="v4-footer">
      <div className="v4-container">
        <p className="v4-small v4-measure" style={{ color: "var(--ink-2)" }}>
          Map is an independent project. It was not created by, is not
          affiliated with, and is not endorsed by the University of North
          Carolina at Chapel Hill or any of its offices. UNC appears only as the
          analytical subject of the reports the tool assembles. Everything here
          is for information only and is not investment advice.
        </p>

        <p className="v4-small v4-measure" style={{ color: "var(--ink-2)", marginTop: 16 }}>
          Reports are drafts for human verification before any outreach.
        </p>

        <p className="v4-small" style={{ color: "var(--ink-3)", marginTop: 32 }}>
          Built on public data:{" "}
          {ATTRIBUTIONS.map((source, i) => (
            <span key={source.name}>
              {i > 0 && " · "}
              <a
                className="v4-cite-link"
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {source.name}
              </a>
            </span>
          ))}
        </p>

        <p className="v4-small" style={{ color: "var(--ink-3)", marginTop: 12 }}>
          <a
            className="v4-cite-link"
            href={LICENSE_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            Apache License 2.0
          </a>
          {" · "}
          <a
            className="v4-cite-link"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            Repository
          </a>
          {" · "}
          <a className="v4-cite-link" href="/privacy">
            Privacy
          </a>
        </p>

        {/* The bar leads with three destinations; every one lives here, so
            nothing the bar leaves out is unreachable — and below 768px, where
            the bar drops its links entirely, this is the only route to them. */}
        <ul className="v4-footer-links" style={{ marginTop: 24 }}>
          {links.map((link) => (
            <li key={link.key}>
              <button
                type="button"
                className="v4-nav-link"
                onClick={() => onNavigate(link.key)}
              >
                {link.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
