import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ComposedChart,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/dashboard/analytics")({
  component: AnalyticsPage,
});

const PIE_COLORS = ["#EF4444", "#F97316", "#3B82F6", "#1D9E75", "#6B7280", "#A855F7"];

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
function fmtDay(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

function AnalyticsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [updated, setUpdated] = useState<string>("");

  async function load() {
    const [r, n] = await Promise.all([
      supabase.from("compliance_records").select("*").order("created_at", { ascending: false }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
    ]);
    setRecords(r.data ?? []);
    setNotifs(n.data ?? []);
    setUpdated(new Date().toLocaleTimeString());
  }
  useEffect(() => {
    load();
    const i = setInterval(load, 60000);
    return () => clearInterval(i);
  }, []);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (start && new Date(r.created_at) < new Date(start)) return false;
      if (end) { const e = new Date(end); e.setHours(23, 59, 59, 999); if (new Date(r.created_at) > e) return false; }
      return true;
    });
  }, [records, start, end]);

  const filteredNotifs = useMemo(() => {
    return notifs.filter((n) => {
      if (start && new Date(n.created_at) < new Date(start)) return false;
      if (end) { const e = new Date(end); e.setHours(23, 59, 59, 999); if (new Date(n.created_at) > e) return false; }
      return true;
    });
  }, [notifs, start, end]);

  // Chart 1: last 14 days compliance rate + total
  const last14 = useMemo(() => {
    const arr: { date: string; key: string; total: number; compliant: number; rate: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      arr.push({ date: fmtDay(d.toISOString()), key: dayKey(d), total: 0, compliant: 0, rate: 0 });
    }
    const map = new Map(arr.map((a) => [a.key, a]));
    filtered.forEach((r) => {
      const k = dayKey(new Date(r.created_at));
      const row = map.get(k);
      if (row) { row.total++; row.compliant++; }
    });
    arr.forEach((a) => { a.rate = a.total ? Math.round((a.compliant / a.total) * 100) : 0; });
    return arr;
  }, [filtered]);

  // Chart 2: Inspections per site
  const perSite = useMemo(() => {
    const map = new Map<string, { site_name: string; count: number; compliant: number }>();
    filtered.forEach((r) => {
      const key = r.site_name ?? r.site_id ?? "unknown";
      const v = map.get(key) ?? { site_name: key, count: 0, compliant: 0 };
      v.count++; v.compliant++;
      map.set(key, v);
    });
    return Array.from(map.values()).map((v) => ({
      ...v,
      rate: v.count ? Math.round((v.compliant / v.count) * 100) : 0,
    }));
  }, [filtered]);

  // Chart 3: PPE violation breakdown from notifications
  const violations = useMemo(() => {
    const map = new Map<string, number>();
    filteredNotifs.filter((n) => n.type === "violation_persisting").forEach((n) => {
      const m = /:\s*(.+?)\s+at\s+/.exec(n.message ?? "");
      const cls = m ? m[1] : "Unknown";
      map.set(cls, (map.get(cls) ?? 0) + 1);
    });
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    return Array.from(map.entries()).map(([name, value]) => ({
      name, value, pct: total ? Math.round((value / total) * 100) : 0,
    }));
  }, [filteredNotifs]);

  // Chart 4: leaderboard
  const leaderboard = useMemo(() => {
    const map = new Map<string, { username: string; total: number; lastSite: string; lastTs: number }>();
    filtered.forEach((r) => {
      const v = map.get(r.username) ?? { username: r.username, total: 0, lastSite: "", lastTs: 0 };
      v.total++;
      const ts = new Date(r.created_at).getTime();
      if (ts > v.lastTs) { v.lastTs = ts; v.lastSite = r.site_name ?? ""; }
      map.set(r.username, v);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filtered]);

  // Chart 5: hazards per day
  const hazardsPerDay = useMemo(() => {
    const arr: { date: string; key: string; count: number; sites: string[] }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      arr.push({ date: fmtDay(d.toISOString()), key: dayKey(d), count: 0, sites: [] });
    }
    const map = new Map(arr.map((a) => [a.key, a]));
    filtered.filter((r) => r.has_hazard).forEach((r) => {
      const k = dayKey(new Date(r.created_at));
      const row = map.get(k);
      if (row) { row.count++; row.sites.push(r.site_name); }
    });
    return arr;
  }, [filtered]);

  // Chart 6: compliance vs hazard correlation
  const correlation = useMemo(() => {
    const map = new Map<string, { site: string; inspections: number; hazards: number }>();
    filtered.forEach((r) => {
      const key = r.site_name ?? r.site_id ?? "unknown";
      const v = map.get(key) ?? { site: key, inspections: 0, hazards: 0 };
      v.inspections++;
      if (r.has_hazard) v.hazards++;
      map.set(key, v);
    });
    return Array.from(map.values());
  }, [filtered]);

  // Chart 7: hour distribution
  const hourly = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: h.toString().padStart(2, "0"), count: 0 }));
    filtered.forEach((r) => { const h = new Date(r.created_at).getHours(); arr[h].count++; });
    return arr;
  }, [filtered]);

  // Summary stats
  const totalAll = records.length;
  const hazardAll = records.filter((r) => r.has_hazard).length;
  const topViolation = violations.sort((a, b) => b.value - a.value)[0]?.name ?? "—";
  const busiestHour = hourly.reduce((a, b) => (b.count > a.count ? b : a), hourly[0])?.hour ?? "—";
  const mostActiveSite = perSite.sort((a, b) => b.count - a.count)[0]?.site_name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#0F172A]">Analytics</h1>
        <span className="text-xs text-gray-500">Last updated: {updated}</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm" />
        </div>
        {(start || end) && (
          <button onClick={() => { setStart(""); setEnd(""); }} className="text-sm text-gray-500 hover:underline">Clear</button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Inspections", value: totalAll },
          { label: "Hazard Reports", value: hazardAll },
          { label: "Top Violation", value: topViolation },
          { label: "Busiest Hour", value: `${busiestHour}:00` },
          { label: "Most Active Site", value: mostActiveSite },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-xl font-bold text-[#0F172A] truncate">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Daily Compliance Rate (last 14 days)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={last14}>
              <CartesianGrid stroke="#eee" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" domain={[0, 100]} />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="rate" stroke="#1D9E75" name="Compliance %" />
              <Line yAxisId="right" type="monotone" dataKey="total" stroke="#3B82F6" name="Inspections" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Inspections per Site">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={perSite}>
              <CartesianGrid stroke="#eee" />
              <XAxis dataKey="site_name" />
              <YAxis />
              <Tooltip formatter={(v: any, _n, p: any) => [`${v} (rate ${p.payload.rate}%)`, "Inspections"]} />
              <Bar dataKey="count">
                {perSite.map((s, i) => (
                  <Cell key={i} fill={s.rate >= 90 ? "#1D9E75" : s.rate >= 70 ? "#F97316" : "#EF4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="PPE Violation Breakdown">
          {violations.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={violations} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(d: any) => `${d.name} ${d.pct}%`}>
                  {violations.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Worker Leaderboard (Top 10)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-gray-600">
                <tr>
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">Username</th>
                  <th className="px-2 py-2">Last Site</th>
                  <th className="px-2 py-2">Inspections</th>
                  <th className="px-2 py-2">Badge</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((w, i) => {
                  const badge = w.total >= 10 ? ["Gold", "bg-green-100 text-[#1D9E75]"] : w.total >= 5 ? ["Silver", "bg-orange-100 text-[#F97316]"] : ["Bronze", "bg-red-100 text-[#EF4444]"];
                  return (
                    <tr key={w.username} className="border-t">
                      <td className="px-2 py-2">{i + 1}</td>
                      <td className="px-2 py-2 font-medium">{w.username}</td>
                      <td className="px-2 py-2">{w.lastSite}</td>
                      <td className="px-2 py-2">{w.total}</td>
                      <td className="px-2 py-2"><span className={`text-xs px-2 py-1 rounded ${badge[1]}`}>{badge[0]}</span></td>
                    </tr>
                  );
                })}
                {leaderboard.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Hazard Reports per Day">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hazardsPerDay}>
              <CartesianGrid stroke="#eee" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(v: any, _n, p: any) => [`${v} (${(p.payload.sites || []).join(", ") || "—"})`, "Hazards"]} />
              <Bar dataKey="count" fill="#F97316" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Compliance vs Hazard Correlation">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={correlation}>
              <CartesianGrid stroke="#eee" />
              <XAxis dataKey="site" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="inspections" fill="#3B82F6" name="Inspections" />
              <Line dataKey="hazards" stroke="#F97316" name="Hazards" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Inspection Time Distribution (by hour)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hourly}>
              <CartesianGrid stroke="#eee" />
              <XAxis dataKey="hour" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h3 className="font-semibold text-[#0F172A] mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No data yet</div>;
}
