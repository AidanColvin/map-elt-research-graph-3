"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import SearchBar from "@/components/ui/SearchBar";
import { SECTORS } from "./sectors";
import { getCompanySuggestion } from "./companySuggestions";

type Mode = "company" | "sector";

export type DashboardHomeProps = {
  userName: string;
  onRunCompany: (name: string) => void;
  onRunSector: (name: string) => void;
  onBrowseAccounts: () => void;
  recentScan: { sector: string; date: string } | null;
  topAccount: { name: string; metric: string };
  accountsCount: number;
  scansRun: number;
};

// takes: a label and value pair
// does: renders one stat of the dashboard stat row
// returns: the stat element
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "var(--tracking-tight)",
          color: "var(--text)",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// takes: the user's name, run callbacks for both engines, the browse action,
//        and live values for the cards and stat row
// does: renders the Dashboard launchpad: greeting, headline, one search bar
//       with a Company / Sector toggle, value cards, and a stat row
// returns: the dashboard overview element
export default function DashboardHome({
  userName,
  onRunCompany,
  onRunSector,
  onBrowseAccounts,
  recentScan,
  topAccount,
  accountsCount,
  scansRun,
}: DashboardHomeProps) {
  const [mode, setMode] = useState<Mode>("company");
  const [query, setQuery] = useState("");

  // takes: the submitted search text
  // does: routes it to the engine the toggle selects; company submissions
  //       complete to the autocomplete suggestion when one matches
  // returns: nothing
  function submit(text: string) {
    if (mode === "company") {
      onRunCompany(getCompanySuggestion(text) ?? text);
    } else {
      onRunSector(text);
    }
    setQuery("");
  }

  return (
    <div style={{ padding: "0 24px", fontFamily: "var(--font)" }}>
      <div
        style={{
          textAlign: "center",
          marginTop: 64,
          fontSize: 15,
          color: "var(--text-2)",
        }}
      >
        Good to see you, {userName}.
      </div>
      <h1
        style={{
          margin: "8px 0 28px",
          textAlign: "center",
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: "var(--tracking-tight)",
          color: "var(--text)",
        }}
      >
        Welcome to Map.
      </h1>

      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div className="tk-seg" role="tablist" aria-label="Search mode">
          {(
            [
              { key: "company", label: "Company" },
              { key: "sector", label: "Sector" },
            ] as { key: Mode; label: string }[]
          ).map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={mode === m.key}
              className={mode === m.key ? "active" : ""}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <SearchBar
          placeholder={
            mode === "company"
              ? "Search any public company or ticker"
              : "Search any sector: Technology, Oncology, Fintech"
          }
          value={query}
          onChange={setQuery}
          onSubmit={submit}
          buttonLabel={mode === "company" ? "Analyze" : "Scan"}
          listId={mode === "sector" ? "dash-sectors" : undefined}
          ariaLabel={mode === "company" ? "Company or ticker" : "Sector"}
        />
        <datalist id="dash-sectors">
          {SECTORS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
          maxWidth: 880,
          margin: "56px auto 0",
        }}
      >
        <Card
          title="Recent Scan"
          icon={<span aria-hidden>◎</span>}
          value={recentScan ? recentScan.sector : "No scans yet"}
          preview={recentScan ? recentScan.date : "Run your first sector scan"}
          onClick={() => onRunSector(recentScan ? recentScan.sector : "Oncology")}
        />
        <Card
          title="Top Account"
          icon={<span aria-hidden>▣</span>}
          value={topAccount.name}
          preview={topAccount.metric}
          onClick={() => onRunCompany(topAccount.name)}
        />
        <Card
          title="Browse Companies"
          icon={<span aria-hidden>▤</span>}
          value={`${accountsCount} companies`}
          preview="Open the partner database →"
          onClick={onBrowseAccounts}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 56,
          margin: "44px auto 24px",
        }}
      >
        <Stat label="Scans run this session" value={String(scansRun)} />
        <Stat label="Accounts tracked" value={String(accountsCount)} />
      </div>
    </div>
  );
}
