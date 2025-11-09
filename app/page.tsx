"use client";

import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Lead, leadsToCsv } from "@/lib/types";

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [limit, setLimit] = useState(150);
  const [days, setDays] = useState(1);

  const total = leads.length;
  const fresh = useMemo(
    () => leads.filter(l => l.postedAt && dayjs(l.postedAt).isAfter(dayjs().subtract(days, "day"))).length,
    [leads, days]
  );

  async function fetchLeads() {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), days: String(days) });
      const res = await fetch(`/api/leads?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = (await res.json()) as { leads: Lead[] };
      setLeads(data.leads);
    } catch (e: any) {
      setError(e.message || "Failed to fetch leads");
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    const csv = leadsToCsv(leads);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dental-receptionist-leads-${dayjs().format("YYYYMMDD-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    // Auto-load on first view
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Dental Receptionist Leads</h1>
        <p className="text-gray-600">Fresh postings across the USA, enriched with contact info.</p>
      </header>

      <section className="flex flex-wrap items-end gap-4 bg-white p-4 rounded-lg shadow-sm">
        <div>
          <label className="block text-sm text-gray-600">Target count</label>
          <input type="number" min={50} max={250} value={limit}
                 onChange={e => setLimit(Number(e.target.value))}
                 className="mt-1 w-36 rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-600">Freshness (days)</label>
          <input type="number" min={1} max={3} value={days}
                 onChange={e => setDays(Number(e.target.value))}
                 className="mt-1 w-36 rounded-md border px-3 py-2" />
        </div>
        <button onClick={fetchLeads} disabled={loading}
                className="rounded-md bg-blue-600 text-white px-4 py-2 disabled:opacity-50">
          {loading ? "Fetching?" : "Fetch leads"}
        </button>
        <button onClick={downloadCsv} disabled={leads.length === 0}
                className="rounded-md bg-gray-900 text-white px-4 py-2 disabled:opacity-40">
          Export CSV
        </button>
        <div className="ml-auto text-sm text-gray-700 flex items-center gap-3">
          <span className="badge">Total: {total}</span>
          <span className="badge">Fresh (&lt;= {days}d): {fresh}</span>
        </div>
      </section>

      <section className="overflow-x-auto">
        <table className="table">
          <thead className="bg-gray-50">
            <tr>
              <Th>Practice</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Location</Th>
              <Th>Posted</Th>
              <Th>Website</Th>
              <Th>Decision Maker</Th>
              <Th>Size</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((l, idx) => (
              <tr key={`${l.practiceName}-${l.location?.city}-${idx}`} className="align-top">
                <Td>{l.practiceName}</Td>
                <Td>{l.phone ?? "?"}</Td>
                <Td>{l.email ?? "?"}</Td>
                <Td>
                  {l.location ? (
                    <span>{[l.location.city, l.location.state, l.location.zip].filter(Boolean).join(", ")}</span>
                  ) : "?"}
                </Td>
                <Td>{l.postedAt ? dayjs(l.postedAt).format("YYYY-MM-DD HH:mm") : l.postedAtText ?? "?"}</Td>
                <Td>
                  {l.website ? (
                    <a href={l.website} target="_blank" className="text-blue-600 underline">Site</a>
                  ) : "?"}
                </Td>
                <Td>{l.decisionMakerName ?? "?"}</Td>
                <Td>{l.practiceSize ?? "?"}</Td>
                <Td>
                  {l.sourceUrl ? (
                    <a href={l.sourceUrl} target="_blank" className="text-blue-600 underline">Job</a>
                  ) : "?"}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3 text-sm text-gray-900">{children}</td>;
}
