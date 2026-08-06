"use client";

/**
 * SignInRequired.tsx
 * The panel a guest sees instead of a view that carries identifiable data.
 *
 * The Directory (the full partner table) and Partnerships (which names real UNC
 * investigators and paper co-authors) are the two views whose contents should
 * not be readable by anyone who simply opens the URL. Guest mode is a one-click
 * door, so those views ask for an account first. Everything else — the home
 * search, company reports, sector scans — stays open to guests, since those are
 * assembled from public filings and name no private individuals.
 *
 * One sentence, one button. Nothing to read twice.
 */

// takes: the view's display name and a handler that opens the sign-in screen
// does: renders a centered, single-action panel explaining why sign-in is needed
// returns: the panel element
export default function SignInRequired({
  viewLabel,
  onSignIn,
}: {
  viewLabel: string;
  onSignIn: () => void;
}) {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "72px 24px",
        maxWidth: 420,
        margin: "0 auto",
        gap: 14,
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
        {viewLabel} needs an account
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: "#6b7280", margin: 0 }}>
        This view lists named people and partner records, so it isn&rsquo;t open to
        guests. Signing in takes a moment.
      </p>
      <button
        onClick={onSignIn}
        style={{
          marginTop: 6,
          padding: "11px 22px",
          borderRadius: 999,
          border: "none",
          background: "#111",
          color: "#fff",
          fontSize: 15,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Sign in
      </button>
    </section>
  );
}
