#!/usr/bin/env python3
"""Generate a one-page non-technical overview PDF for MAP."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT

# --- Palette ---------------------------------------------------------------
NAVY = colors.HexColor("#13294B")   # UNC-ish deep navy
BLUE = colors.HexColor("#2E5A9C")
ACCENT = colors.HexColor("#4B9CD3")  # Carolina blue
INK = colors.HexColor("#1F2933")
GREY = colors.HexColor("#5B6770")
LIGHT = colors.HexColor("#EEF3F8")
LINE = colors.HexColor("#D5DEE8")

OUT = "MAP_overview.pdf"

doc = SimpleDocTemplate(
    OUT, pagesize=letter,
    topMargin=0.45 * inch, bottomMargin=0.4 * inch,
    leftMargin=0.6 * inch, rightMargin=0.6 * inch,
)

ss = getSampleStyleSheet()

H1 = ParagraphStyle("H1", parent=ss["Normal"], fontName="Helvetica-Bold",
                    fontSize=20, leading=22, textColor=NAVY)
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontName="Helvetica",
                     fontSize=9.5, leading=12.5, textColor=GREY)
SECT = ParagraphStyle("SECT", parent=ss["Normal"], fontName="Helvetica-Bold",
                      fontSize=10.5, leading=12, textColor=BLUE,
                      spaceBefore=2, spaceAfter=3)
BODY = ParagraphStyle("BODY", parent=ss["Normal"], fontName="Helvetica",
                      fontSize=9, leading=12.2, textColor=INK, alignment=TA_LEFT)
BODYB = ParagraphStyle("BODYB", parent=BODY, fontName="Helvetica-Bold")
SMALL = ParagraphStyle("SMALL", parent=ss["Normal"], fontName="Helvetica",
                       fontSize=7.5, leading=9.5, textColor=GREY)
STEP_T = ParagraphStyle("STEP_T", parent=BODY, fontName="Helvetica-Bold",
                        fontSize=8.8, leading=10.5, textColor=NAVY)
STEP_B = ParagraphStyle("STEP_B", parent=BODY, fontSize=7.8, leading=9.6,
                        textColor=GREY)
CARD_H = ParagraphStyle("CARD_H", parent=BODYB, fontSize=9, leading=11,
                        textColor=NAVY)

story = []

# --- Header ----------------------------------------------------------------
story.append(Paragraph("MAP — Research, written for you.", H1))
story.append(Spacer(1, 2))
story.append(Paragraph(
    "An automated research tool for partnership &amp; intelligence teams. "
    "Type a company, sector, or topic — get a sourced, board-ready report in about a minute.",
    SUB))
story.append(Spacer(1, 6))
story.append(HRFlowable(width="100%", thickness=1.4, color=ACCENT,
                        spaceBefore=0, spaceAfter=8))


def section(title, flowables):
    """A titled block of body content."""
    story.append(Paragraph(title, SECT))
    for f in flowables:
        story.append(f)
    story.append(Spacer(1, 7))


# --- The Problem -----------------------------------------------------------
section("THE PROBLEM", [
    Paragraph(
        "Before any outreach, someone has to read the filings, check the trials, pull the grants, "
        "and find the researchers. Today that is slow, manual, and expensive:", BODY),
    Spacer(1, 3),
    Paragraph("&bull;&nbsp; <b>Hours per company.</b> Research across SEC, PubMed, NIH and "
              "ClinicalTrials can take a full day per target.", BODY),
    Paragraph("&bull;&nbsp; <b>Sources are scattered.</b> Every data point lives in a different "
              "database and format, with no single view.", BODY),
    Paragraph("&bull;&nbsp; <b>Numbers go stale.</b> Revenue, trial status and leadership change "
              "constantly — saved decks go out of date.", BODY),
    Paragraph("&bull;&nbsp; <b>AI tools cost money and make things up.</b> Per-query fees add up, "
              "and generated text can't always be trusted.", BODY),
])

# --- Goals -----------------------------------------------------------------
section("THE GOAL", [
    Paragraph(
        "Give the team accurate company and partnership research in minutes instead of days — "
        "with <b>every fact traceable to a real source</b>, <b>no AI guesswork</b>, and "
        "<b>no cost per report.</b>", BODY),
])

# --- The Solution (three tools as cards) -----------------------------------
story.append(Paragraph("THE SOLUTION — ONE APP, THREE TOOLS", SECT))

card_data = [[
    Paragraph("Company deep dive", CARD_H),
    Paragraph("Sector scan", CARD_H),
    Paragraph("UNC partnerships", CARD_H),
], [
    Paragraph("A full profile of any public company, built from its own SEC filings and live data.", STEP_B),
    Paragraph("Type an industry — get the top companies in that sector, ranked and sourced.", STEP_B),
    Paragraph("For any company, finds real overlap with UNC research, plus ready-to-send talking points.", STEP_B),
]]
card = Table(card_data, colWidths=[2.36 * inch] * 3)
card.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
    ("BOX", (0, 0), (0, -1), 0.6, LINE),
    ("BOX", (1, 0), (1, -1), 0.6, LINE),
    ("BOX", (2, 0), (2, -1), 0.6, LINE),
    ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("TOPPADDING", (0, 0), (-1, 0), 7),
    ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
    ("TOPPADDING", (0, 1), (-1, 1), 2),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
story.append(card)
story.append(Spacer(1, 4))
story.append(Paragraph(
    "Output comes ready to use: <b>Word, Excel, PowerPoint, PDF or Markdown</b> — take it straight "
    "into a meeting or to leadership.", BODY))
story.append(Spacer(1, 7))

# --- How it works (4 steps) ------------------------------------------------
story.append(Paragraph("HOW IT WORKS — FOUR STEPS, NO GUESSWORK", SECT))

steps = [
    ("1. You type a name or topic",
     "A company, a sector, or a research area. No account needed to try it."),
    ("2. MAP reads the public record",
     "It checks SEC EDGAR, NIH grants, PubMed papers, and ClinicalTrials.gov — all at once."),
    ("3. A sourced brief assembles",
     "Overview, financials, research alignment and partnership signals — built live, with citations."),
    ("4. You get a brief you can use",
     "Download, share with leadership, or use it to draft outreach. Every line traces to a source."),
]
step_cells = []
for t, b in steps:
    step_cells.append([Paragraph(t, STEP_T), Paragraph(b, STEP_B)])

# 2x2 grid
grid = [
    [step_cells[0], step_cells[1]],
    [step_cells[2], step_cells[3]],
]
flat = [[Table([c], colWidths=[3.45 * inch]) for c in row] for row in grid]
steps_tbl = Table(
    [[Paragraph(steps[0][0], STEP_T), Paragraph(steps[1][0], STEP_T)],
     [Paragraph(steps[0][1], STEP_B), Paragraph(steps[1][1], STEP_B)],
     [Paragraph(steps[2][0], STEP_T), Paragraph(steps[3][0], STEP_T)],
     [Paragraph(steps[2][1], STEP_B), Paragraph(steps[3][1], STEP_B)]],
    colWidths=[3.55 * inch, 3.55 * inch])
steps_tbl.setStyle(TableStyle([
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 14),
    ("TOPPADDING", (0, 0), (-1, -1), 1),
    ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
    ("BOTTOMPADDING", (0, 1), (-1, 1), 7),
    ("BOTTOMPADDING", (0, 2), (-1, 2), 1),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LINEBEFORE", (1, 0), (1, -1), 0.5, LINE),
    ("LEFTPADDING", (1, 0), (1, -1), 12),
]))
story.append(steps_tbl)
story.append(Spacer(1, 8))

# --- Maintenance & Cost (highlighted) --------------------------------------
mc_title = Paragraph("LONG-TERM MAINTENANCE &amp; COST", SECT)
mc_body = [
    Paragraph("&bull;&nbsp; <b>$0 to run, per report.</b> No AI sits in the request path and no paid "
              "API keys are required — so there is no per-use or per-query fee.", BODY),
    Paragraph("&bull;&nbsp; <b>Free public data.</b> Every number and citation comes from free "
              "government and research databases (SEC, NIH, PubMed, ClinicalTrials).", BODY),
    Paragraph("&bull;&nbsp; <b>Hosting is the only recurring cost.</b> Standard low-cost web hosting; "
              "no expensive infrastructure or licenses.", BODY),
    Paragraph("&bull;&nbsp; <b>Maintenance is light.</b> Upkeep is occasional adjustments when a public "
              "data source changes its format — not constant rebuilds.", BODY),
    Paragraph("&bull;&nbsp; <b>Always current.</b> Reports are generated fresh each time, so the data is "
              "live rather than a deck that quietly goes stale.", BODY),
]
mc_inner = [[mc_title]] + [[f] for f in mc_body]
mc_tbl = Table(mc_inner, colWidths=[7.1 * inch])
mc_tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
    ("LINEABOVE", (0, 0), (-1, 0), 2, ACCENT),
    ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ("TOPPADDING", (0, 0), (-1, 0), 6),
    ("TOPPADDING", (0, 1), (-1, -1), 1),
    ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
]))
story.append(mc_tbl)
story.append(Spacer(1, 8))

# --- Footer / disclaimer ---------------------------------------------------
story.append(HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=4))
story.append(Paragraph(
    "Independent research tool. All data comes from public records. Reports are drafts for human review. "
    "Not investment advice. Not affiliated with UNC Chapel Hill.", SMALL))

doc.build(story)
print("wrote", OUT)
