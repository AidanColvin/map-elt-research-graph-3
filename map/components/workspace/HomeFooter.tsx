"use client";

const YEAR = 2026;

// takes: nothing
// does: renders the quiet closing row for the Home view — data-source
//       credit, contact, privacy, copyright
// returns: the footer element
export default function HomeFooter() {
  return (
    <footer
      style={{
        marginTop: 56,
        paddingTop: 20,
        borderTop: "1px solid var(--line)",
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 20px",
        fontSize: "var(--text-caption)",
        color: "var(--ink-tertiary)",
      }}
    >
      <span>Built on public data: SEC EDGAR · PubMed · OpenAlex · NIH RePORTER · ClinicalTrials.gov</span>
      <a href="mailto:aidanacolvin@gmail.com" style={linkStyle}>Contact</a>
      <a href="/privacy" style={linkStyle}>Privacy</a>
      <span>© {YEAR} Map</span>
    </footer>
  );
}

const linkStyle: React.CSSProperties = {
  color: "inherit",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};
