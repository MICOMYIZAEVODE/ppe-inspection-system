import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { IconAlertTriangle, IconCheck, IconClock, IconUser, IconMapPin } from "@tabler/icons-react";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivity();
    
    const subscription = supabase
      .channel("home_activity")
      .on("postgres_changes", 
        { event: "*", schema: "public", table: "compliance_records" },
        () => fetchActivity()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, []);

  const fetchActivity = async () => {
    const { data } = await supabase
      .from("compliance_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);
    
    setRecentActivity(data || []);
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column - Live Feed */}
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-800">🟢 Live Activity Feed</h2>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-400">Loading...</div>
            ) : recentActivity.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p>No activity yet</p>
              </div>
            ) : (
              recentActivity.map((item) => (
                <div key={item.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${item.has_hazard ? 'bg-red-100' : 'bg-green-100'}`}>
                      {item.has_hazard ? (
                        <IconAlertTriangle size={16} className="text-red-600" />
                      ) : (
                        <IconCheck size={16} className="text-green-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <IconUser size={14} className="text-gray-400" />
                        <span className="font-medium text-gray-800">{item.username}</span>
                        <span className="text-gray-300">•</span>
                        <IconMapPin size={14} className="text-gray-400" />
                        <span className="text-sm text-gray-600">{item.site_id}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {item.has_hazard ? `⚠️ Hazard reported: ${item.hazard_comment || 'Yes'}` : '✅ PPE compliant'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Column - Quick Actions */}
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl shadow-sm p-6 text-white">
          <h3 className="text-lg font-semibold mb-2">🎯 Quick Action</h3>
          <p className="text-green-100 text-sm mb-4">Start a new PPE inspection for a worker</p>
          <a 
            href="/inspect"
            className="inline-flex items-center gap-2 bg-white text-green-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition"
          >
            <IconUser size={18} />
            Start New Inspection
          </a>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">ℹ️ System Status</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">AI Model Status</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Active</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Camera Detection</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Ready</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Database Connection</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Connected</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}