"use client";

import FormatsSection from "./FormatsSection";
import HomeHero from "./HomeHero";
import ProvenanceSection from "./ProvenanceSection";
import RulesSection from "./RulesSection";
import Section from "./Section";
import SiteFooter from "./SiteFooter";
import type { NavLink } from "./SiteNav";

/**
 * takes the submit handler for a subject, the nav links, and a navigate handler
 * lays out the homepage's four content sections and the footer, in order, on
 * full-bleed paper with no card floating on top of it
 * returns the page element
 */
export default function HomePage({
  onSubmit,
  links,
  onNavigate,
}: {
  onSubmit: (query: string) => void;
  links: NavLink[];
  onNavigate: (key: string) => void;
}) {
  return (
    <div className="v4 v4-page">
      <Section id="hero" first label="Read a company or a research area">
        <div className="v4-hero">
          <HomeHero onSubmit={onSubmit} />
        </div>
      </Section>

      <Section id="provenance" label="Where the brief comes from">
        <ProvenanceSection />
      </Section>

      <Section id="rules" label="The rules the reports hold to">
        <RulesSection />
      </Section>

      <Section id="formats" label="What you leave with">
        <FormatsSection />
      </Section>

      <SiteFooter links={links} onNavigate={onNavigate} />
    </div>
  );
}
