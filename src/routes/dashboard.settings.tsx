import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, ADMIN_EMAIL } from "@/lib/supabase";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [confidence, setConfidence] = useState(90);
  const [timer, setTimer] = useState(60);
  const [id, setId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("*").limit(1).maybeSingle().then(({ data }) => {
      if (data) {
        setId(data.id);
        setConfidence(data.confidence_threshold ?? 90);
        setTimer(data.violation_timer_seconds ?? 60);
      }
    });
  }, []);

  async function save() {
    setMsg(""); setSaving(true);
    const payload = { confidence_threshold: confidence, violation_timer_seconds: timer };
    let res;
    if (id) {
      res = await supabase.from("settings").update(payload).eq("id", id);
    } else {
      res = await supabase.from("settings").insert(payload).select().single();
      if (res.data) setId(res.data.id);
    }
    if (res.error) setMsg(res.error.message);
    else setMsg("Settings saved.");
    setSaving(false);
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-[#0F172A]">Settings</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Confidence Threshold (%)</label>
          <div className="flex items-center gap-3">
            <input type="range" min={70} max={100} value={confidence} onChange={(e) => setConfidence(+e.target.value)} className="flex-1" />
            <input type="number" min={70} max={100} value={confidence} onChange={(e) => setConfidence(+e.target.value)} className="w-20 border border-gray-300 rounded px-2 py-1" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Violation Timer (seconds)</label>
          <input type="number" min={10} value={timer} onChange={(e) => setTimer(+e.target.value)} className="w-32 border border-gray-300 rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Admin Email</label>
          <p className="text-sm text-gray-700 bg-gray-100 px-3 py-2 rounded">{ADMIN_EMAIL}</p>
          <p className="text-xs text-gray-500 mt-1">To change admin email contact system administrator</p>
        </div>
        <button onClick={save} disabled={saving} className="bg-[#1D9E75] hover:bg-[#178a64] disabled:opacity-60 text-white font-semibold px-5 py-2 rounded-lg">
          {saving ? "Saving..." : "Save"}
        </button>
        {msg && <p className="text-sm text-gray-600">{msg}</p>}
      </div>
    </div>
  );
}
