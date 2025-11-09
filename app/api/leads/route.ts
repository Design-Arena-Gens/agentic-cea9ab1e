import { NextRequest, NextResponse } from "next/server";
import { Lead, LeadSchema } from "@/lib/types";
import { fetchZipRecruiterLeads } from "@/lib/sources/ziprecruiter";
import { fetchCareerBuilderLeads } from "@/lib/sources/careerbuilder";
import { findWebsiteForPractice, extractContactsFromWebsite } from "@/lib/enrich";
import { uniqBy, wait } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = clampInt(searchParams.get("limit"), 100, 50, 250);
  const days = clampInt(searchParams.get("days"), 1, 1, 3);
  const maxPages = clampInt(process.env.SCRAPE_MAX_PAGES ?? "2", 2, 1, 5);

  try {
    const [zr, cb] = await Promise.all([
      fetchZipRecruiterLeads(days, maxPages),
      fetchCareerBuilderLeads(days, maxPages),
    ]);

    let leads = uniqBy([...zr, ...cb], l => `${(l.practiceName || "").toLowerCase()}|${l.location?.city}|${l.location?.state}`)
      .slice(0, limit * 2); // oversample for post-filtering

    // Filter out old postings if postedAt available
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    leads = leads.filter(l => !l.postedAt || new Date(l.postedAt).getTime() >= cutoff);

  // Enrich concurrently but politely (simple concurrency pool)
  const concurrency = 6;
  const enriched: Lead[] = [];
  let index = 0;
  async function worker(workerId: number) {
    while (index < leads.length) {
      const current = index++;
      const lead = leads[current];
      // small jitter to avoid hammering providers
      await wait(100 + (current % concurrency) * 50);
      try {
        const website = await findWebsiteForPractice(lead.practiceName, lead.location?.city, lead.location?.state);
        let phone: string | undefined;
        let email: string | undefined;
        let decisionMakerName: string | undefined;
        let practiceSize: string | undefined;
        if (website) {
          const contacts = await extractContactsFromWebsite(website);
          phone = contacts.phone;
          email = contacts.email;
          decisionMakerName = contacts.decisionMaker;
          practiceSize = contacts.size;
        }
        const merged: Lead = {
          ...lead,
          website: website ?? lead.website,
          phone: phone ?? lead.phone,
          email: email ?? lead.email,
          decisionMakerName: decisionMakerName ?? lead.decisionMakerName,
          practiceSize: practiceSize ?? lead.practiceSize,
        };
        // validate shape
        LeadSchema.parse(merged);
        enriched.push(merged);
      } catch {
        // skip invalid
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, leads.length) }, (_, i) => worker(i)));

    // Final pass: keep those with at least phone or email, limit to requested
    const prioritized = enriched
      .filter(l => !!(l.phone || l.email))
      .slice(0, limit);

    return NextResponse.json({ leads: prioritized });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : def;
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
