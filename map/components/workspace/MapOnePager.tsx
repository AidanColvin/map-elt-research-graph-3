// MapOnePager.tsx
// Drop-in one-pager for MAP. Apple-clean. Tailwind + dark mode.
// Place in map/components/workspace/ and render at the bottom of the dashboard.

export default function MapOnePager() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-14 font-sans text-[#1d1d1f] dark:text-[#f5f5f7]">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#6e6e73]">
        MAP — Market and Accounts Platform
      </p>
      <h1 className="mb-3 text-[28px] font-semibold leading-tight tracking-tight">
        A program that does the research and writes the report
      </h1>
      <p className="mb-10 text-[16px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
        MAP supports the Research and Intelligence team. Type a company or
        sector. It pulls the data and drafts the report for you to review.
      </p>

      <SectionLabel>The problem it solves</SectionLabel>
      <div className="mb-10 rounded-2xl border-l-2 border-[#0071e3] bg-[#f5f5f7] p-5 text-[15px] leading-relaxed dark:bg-[#1c1c1e]">
        Interns spend hours reading and researching before they can write one
        report on a sector, a company, or a UNC partnership. They check SEC
        EDGAR, ClinicalTrials.gov, NIH grants, PubMed, and the UNC website one
        source at a time. That time is expensive. So are the AI tokens when a
        model reads and writes it all. MAP cuts both. It reads the sources and
        builds the draft.
      </div>

      <SectionLabel>Where the cost goes today</SectionLabel>
      <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CostCard title="Time">
          Hours per report spent reading filings, trials, grants, and papers by
          hand. Slow and hard to repeat.
        </CostCard>
        <CostCard title="AI tokens">
          Every page fed to a model to read or write costs money. It adds up
          fast across many companies.
        </CostCard>
      </div>

      <SectionLabel>How MAP works</SectionLabel>
      <div className="mb-10">
        <svg
          width="100%"
          viewBox="0 0 680 150"
          role="img"
          xmlns="http://www.w3.org/2000/svg"
          fontFamily="-apple-system, 'SF Pro Text', system-ui, Helvetica, Arial, sans-serif"
        >
          <title>How MAP works</title>
          <desc>You type a company or sector. MAP reads five public sources and drafts the report. You review and act.</desc>
          <defs>
            <marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="#86868B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </marker>
          </defs>

          <rect x="40" y="34" width="130" height="58" rx="12" fill="#F5F5F7" stroke="#D2D2D7" strokeWidth="0.5"/>
          <text x="105" y="58" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#1D1D1F">You type</text>
          <text x="105" y="76" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#6E6E73">company or sector</text>

          <rect x="196" y="34" width="130" height="58" rx="12" fill="#E8F1FD" stroke="#0071E3" strokeWidth="0.5"/>
          <text x="261" y="58" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#0071E3">MAP</text>
          <text x="261" y="76" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#6E6E73">reads and drafts</text>

          <rect x="352" y="34" width="130" height="58" rx="12" fill="#F5F5F7" stroke="#D2D2D7" strokeWidth="0.5"/>
          <text x="417" y="58" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#1D1D1F">Report</text>
          <text x="417" y="76" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#6E6E73">sourced draft</text>

          <rect x="508" y="34" width="130" height="58" rx="12" fill="#F5F5F7" stroke="#D2D2D7" strokeWidth="0.5"/>
          <text x="573" y="58" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill="#1D1D1F">You act</text>
          <text x="573" y="76" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="#6E6E73">review and send</text>

          <line x1="172" y1="63" x2="193" y2="63" stroke="#86868B" strokeWidth="1" markerEnd="url(#map-arrow)"/>
          <line x1="328" y1="63" x2="349" y2="63" stroke="#86868B" strokeWidth="1" markerEnd="url(#map-arrow)"/>
          <line x1="484" y1="63" x2="505" y2="63" stroke="#86868B" strokeWidth="1" markerEnd="url(#map-arrow)"/>

          <text x="340" y="126" textAnchor="middle" fontSize="12" fill="#6E6E73">Reads: SEC EDGAR · ClinicalTrials.gov · NIH RePORTER · PubMed · UNC website</text>
        </svg>
        <p className="mt-3 text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
          You type a company or sector. MAP reads five public sources. It drafts
          the report. You review and act.
        </p>
      </div>

      <SectionLabel>The three tools</SectionLabel>
      <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ToolCard title="Company deep dive">Full profile from SEC filings.</ToolCard>
        <ToolCard title="Sector scan">Top companies in a sector, ranked.</ToolCard>
        <ToolCard title="UNC partnerships">Overlap with UNC research.</ToolCard>
      </div>

      <SectionLabel>What you get out</SectionLabel>
      <div className="mb-10 flex flex-wrap gap-2">
        {["Word report", "Excel workbook", "PowerPoint deck", "PDF summary", "$0 to run"].map(
          (t) => (
            <span
              key={t}
              className="rounded-full border border-[#d2d2d7] bg-[#f5f5f7] px-3.5 py-1.5 text-[13px] text-[#1d1d1f] dark:border-[#3a3a3c] dark:bg-[#1c1c1e] dark:text-[#f5f5f7]"
            >
              {t}
            </span>
          )
        )}
      </div>

      <p className="border-t border-[#d2d2d7] pt-4 text-[12px] leading-relaxed text-[#86868b] dark:border-[#3a3a3c]">
        Independent research tool. All data comes from public records. Reports
        are drafts for human review. Not investment advice. Not affiliated with
        UNC Chapel Hill.
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.07em] text-[#6e6e73]">
      {children}
    </p>
  );
}

function CostCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#d2d2d7] p-4 dark:border-[#3a3a3c]">
      <p className="mb-1 text-[13px] font-medium text-[#0071e3]">{title}</p>
      <p className="text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
        {children}
      </p>
    </div>
  );
}

function ToolCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#d2d2d7] p-4 dark:border-[#3a3a3c]">
      <p className="mb-1 text-[14px] font-medium">{title}</p>
      <p className="truncate text-[12px] leading-relaxed text-[#6e6e73] dark:text-[#a1a1a6]">
        {children}
      </p>
    </div>
  );
}
