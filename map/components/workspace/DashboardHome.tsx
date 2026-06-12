"use client";

import { useState } from "react";
import { SECTORS } from "./sectors";
import { getCompanySuggestion } from "./companySuggestions";

type Quick = { label: string; onClick: () => void };

// takes: onRunCompany(name), onRunSector(name), and the quick-access widgets
// does: renders the Apple-style Dashboard launchpad — greeting, a single
//       floating glass command deck, and a row of quick-access cards
// returns: the dashboard overview element
export default function DashboardHome({
  onRunCompany,
  onRunSector,
  quick,
}: {
  onRunCompany: (name: string) => void;
  onRunSector: (name: string) => void;
  quick: Quick[];
}) {
  return (
    <div className="px-6">
      <h1 className="text-4xl font-light tracking-tight text-gray-900 mt-20 mb-8 text-center">
        Welcome to Map.
      </h1>

      <CommandDeck onRunCompany={onRunCompany} onRunSector={onRunSector} />

      <div className="grid grid-cols-3 gap-6 max-w-4xl mx-auto mt-16">
        {quick.map((q) => (
          <div
            key={q.label}
            onClick={q.onClick}
            className="p-6 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/10 hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer"
          >
            <p className="text-sm text-gray-500">{q.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// takes: onRunCompany(name) and onRunSector(name) callbacks
// does: renders the consolidated spotlight deck — a company search (with inline
//       gray autocomplete) and a sector dropdown in one floating glass pill
// returns: the command-deck element
function CommandDeck({
  onRunCompany,
  onRunSector,
}: {
  onRunCompany: (name: string) => void;
  onRunSector: (name: string) => void;
}) {
  const [company, setCompany] = useState("");
  const [sector, setSector] = useState(SECTORS[0]);

  const suggestion = getCompanySuggestion(company);
  const ghostSuffix = suggestion ? suggestion.slice(company.length) : "";

  // takes: a form submit event
  // does: runs the completed company suggestion if one is showing, else what
  //       was typed; clears the field afterward
  // returns: nothing
  function submitCompany(e: React.FormEvent) {
    e.preventDefault();
    const target = suggestion ?? company;
    if (target.trim()) {
      onRunCompany(target);
      setCompany("");
    }
  }

  // takes: a keydown event on the company input
  // does: accepts the gray ghost suggestion on Tab or Right-arrow-at-end
  // returns: nothing
  function onCompanyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestion) return;
    const atEnd = e.currentTarget.selectionStart === company.length;
    if (e.key === "Tab" || (e.key === "ArrowRight" && atEnd)) {
      e.preventDefault();
      setCompany(suggestion);
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex items-center gap-4 p-4 bg-white/70 backdrop-blur-md border border-white/20 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <form onSubmit={submitCompany} className="relative flex-1">
        {ghostSuffix && (
          <div
            aria-hidden
            className="absolute inset-0 flex items-center px-3 py-2 text-[15px] pointer-events-none overflow-hidden whitespace-pre"
            style={{ fontFamily: "inherit", lineHeight: "normal" }}
          >
            <span style={{ color: "transparent" }}>{company}</span>
            <span style={{ color: "#b6b6bc" }}>{ghostSuffix}</span>
          </div>
        )}
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          onKeyDown={onCompanyKeyDown}
          placeholder="Search a company…"
          aria-label="Company or ticker"
          autoComplete="off"
          spellCheck={false}
          className="relative w-full bg-transparent border-0 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none px-3 py-2"
        />
      </form>

      <div className="h-6 w-px bg-gray-200" aria-hidden />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onRunSector(sector);
        }}
        className="flex items-center gap-3"
      >
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          aria-label="Sector"
          className="bg-transparent border-0 text-[15px] text-gray-700 outline-none cursor-pointer pr-1"
        >
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-2xl bg-gray-900/90 hover:bg-gray-900 text-white text-sm font-medium px-5 py-2 transition-colors"
        >
          Scan
        </button>
      </form>
    </div>
  );
}
