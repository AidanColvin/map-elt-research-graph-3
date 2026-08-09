import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — Map",
  description: "What Map collects, what it doesn't, and how to reach the owner.",
};

// takes: nothing
// does: renders the public privacy page linked from the Home footer
// returns: the page element
export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--ink)",
        fontFamily: "var(--sans)",
        padding: "64px 24px",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href="/" style={{ color: "var(--ink-secondary)", fontSize: 14, textDecoration: "none" }}>← Back to Map</a>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 20, marginBottom: 24 }}>
          Privacy
        </h1>

        <Section title="What Map reads">
          Map answers your search by reading public records — SEC EDGAR filings, PubMed,
          NIH RePORTER, OpenAlex, and ClinicalTrials.gov. Your search text is sent to
          those public APIs and to Map&apos;s own backend to assemble the report; it is not
          sold or shared for advertising, because Map doesn&apos;t run ads or trackers.
        </Section>

        <Section title="What's stored, and where">
          You can use Map fully as a guest — nothing about a guest visit is stored on a
          server. If you create an account, your session and any saved projects are kept
          in your browser&apos;s local storage; email addresses are never stored in plain
          text. Named researchers shown in Partnerships and the Directory come from public
          NIH/PubMed records and are only shown to approved accounts.
        </Section>

        <Section title="What Map doesn't do">
          No ad trackers, no analytics that follow you off this site, no selling of your
          data to anyone. Firebase handles Google/Microsoft sign-in when it's configured;
          Map only receives the account email it needs to run the approval flow.
        </Section>

        <Section title="Deletion and questions">
          Email the address below and the record will be removed. Same address for any
          other question about what this page describes.
        </Section>

        <p style={{ fontSize: 14, color: "var(--ink-secondary)", marginTop: 8 }}>
          <a href="mailto:aidanacolvin@gmail.com" style={{ color: "var(--accent)" }}>aidanacolvin@gmail.com</a>
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</h2>
      <p style={{ fontSize: 15, color: "var(--ink-secondary)", lineHeight: 1.65 }}>{children}</p>
    </section>
  );
}
