# How Map Works

A one page brief, written for any reader.

## The goal

University partnership teams spend hours researching companies by hand: pulling financials, reading filings, finding which companies overlap with campus research, and assembling it all into a report someone can act on. Map set out to do that mechanical work in about a minute, with three rules:

1. **Free forever.** No paid services anywhere. Anyone can run it without signing up for anything.
2. **Every fact has a source.** Each number and claim links back to an official public record, so a reader can check it.
3. **No made up text.** There is no AI writing in the reports. The words come from official filings and public databases, assembled by fixed rules.

## What it does

Map is one website with three tools behind a single sign in:

* **Company Deep Dive.** Type any public company and get a full report: what the company does, its financials, its risks, its leadership, with charts. Seven major companies (Apple, NVIDIA, Microsoft, Alphabet, AWS, Anthropic, OpenAI) have hand written reports that load instantly. Every other public company gets a report built live from government records.
* **Sector Scan.** Type an industry (for example "Oncology") and get a report mapping the companies in that industry to related research at UNC Chapel Hill: who they are, what they are working on, where the overlap is, and talking points for outreach. The same data also opens as charts, ten year financial trends, a spreadsheet, and a slide deck.
* **Accounts.** A table of 142 partner companies with researched, verified profiles, downloadable as a spreadsheet, a PDF, or plain text.

## How it works

All the facts come from free public sources that need no account or key:

| Source | What it provides |
|---|---|
| SEC EDGAR (the US government filing system) | financials, annual reports, executive names |
| ClinicalTrials.gov | what each company is testing in the clinic |
| PubMed | published research, including papers coauthored with UNC |
| NIH RePORTER | government research grants |
| Wikipedia and OpenAlex | company overviews and research activity |

When you ask for a report, the app fetches from these sources at the same time (so it stays fast), then assembles the report section by section using fixed rules. For a deep dive, the narrative is the company's own words taken from its latest annual report. For a sector scan, every claim must be backed by at least two official sources; anything that cannot be double checked is flagged for human review instead of guessed. Wikipedia and news aggregators are never used as citations.

The report streams onto your screen as it is built, with a live progress bar showing real work ("4 of 18 companies analyzed"), not a timer.

## How to use it

1. Open the site and sign in (email and password, Google, or Microsoft).
2. From the Dashboard, type a company name to run a Deep Dive, or an industry name to run a Sector Scan.
3. Read the report on screen. Citations are numbered; click any source to verify it.
4. For a sector scan, switch views at the top: Report, Visualize (charts), Trends (ten year financials), Excel, or Slide Deck.
5. Download what you need: PDF, Word, Markdown, Excel, or PowerPoint.
6. Open the Accounts tab to browse the partner database and download it.

## What to keep in mind

* Private companies have no government filings, so their reports are lighter.
* Reports are drafts. They remove the mechanical research work, but a person should verify before acting on them.
* This is an independent project, not affiliated with or endorsed by UNC Chapel Hill, and it is not investment advice.
