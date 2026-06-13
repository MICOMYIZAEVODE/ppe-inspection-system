import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TowerIcon } from "@/components/TowerIcon";
import {
  IconCheck,
  IconClock,
  IconX,
  IconAlertTriangle,
  IconRefresh,
  IconPhoto,
} from "@tabler/icons-react";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

function StatusPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    
    try {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .eq("username", username.trim())
        .maybeSingle();
        
      if (error || !data) {
        setLoginError("Invalid username or password");
      } else if (data.status !== "active") {
        setLoginError("Account deactivated. Contact your safety manager.");
      } else {
        if (password === "test123") {
          setLoggedIn(true);
          fetchInspections(username.trim());
        } else {
          setLoginError("Invalid username or password");
        }
      }
    } catch {
      setLoginError("Invalid username or password");
    } finally {
      setLoggingIn(false);
    }
  }

  async function fetchInspections(workerName: string) {
    setLoading(true);
    const { data } = await supabase
      .from("compliance_records")
      .select("*")
      .eq("username", workerName)
      .order("created_at", { ascending: false });
    
    setInspections(data || []);
    setLoading(false);
  }

  function getStatusDisplay(status: string) {
    switch(status) {
      case 'approved':
        return {
          icon: <IconCheck size={48} className="text-green-600" />,
          title: "Approved",
          message: "Your PPE inspection has been approved. You may climb the tower.",
          color: "bg-green-50 border-green-200",
          textColor: "text-green-700"
        };
      case 'rejected':
        return {
          icon: <IconX size={48} className="text-red-600" />,
          title: "Rejected",
          message: "Your PPE inspection was rejected. Please check your equipment and try again.",
          color: "bg-red-50 border-red-200",
          textColor: "text-red-700"
        };
      default:
        return {
          icon: <IconClock size={48} className="text-yellow-600" />,
          title: "Pending Review",
          message: "Your inspection is waiting for manager review. Please check back later.",
          color: "bg-yellow-50 border-yellow-200",
          textColor: "text-yellow-700"
        };
    }
  }

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 w-full max-w-md">
          <div className="flex justify-center mb-3">
            <TowerIcon className="w-14 h-14 text-[#1D9E75]" />
          </div>
          <h1 className="text-2xl font-bold text-center text-[#0F172A] mb-1">Check Status</h1>
          <p className="text-center text-sm text-gray-500 mb-6">Login to view your inspection status</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
                required
              />
            </div>
            {loginError && <p className="text-sm text-[#EF4444]">{loginError}</p>}
            <button
              type="submit"
              disabled={loggingIn}
              className="w-full bg-[#1D9E75] hover:bg-[#178a64] disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition"
            >
              {loggingIn ? "Logging in..." : "View My Status"}
            </button>
          </form>
          <p className="text-xs text-center text-gray-400 mt-4">Test: test / test123</p>
          <a href="/inspect" className="block text-center text-xs text-blue-600 hover:text-blue-800 mt-2">
            Start New Inspection →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">My Inspection Status</h1>
              <p className="text-gray-500 text-sm mt-1">Welcome back, {username}</p>
            </div>
            <button
              onClick={() => {
                setLoggedIn(false);
                setInspections([]);
                setUsername("");
                setPassword("");
              }}
              className="text-red-600 hover:text-red-700 text-sm"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Latest Status Card */}
        {inspections.length > 0 && (
          <div className={`rounded-xl shadow-sm p-6 mb-6 border-2 ${getStatusDisplay(inspections[0].review_status || 'pending_review').color}`}>
            <div className="flex flex-col items-center text-center">
              {getStatusDisplay(inspections[0].review_status || 'pending_review').icon}
              <h2 className="text-2xl font-bold mt-3">{getStatusDisplay(inspections[0].review_status || 'pending_review').title}</h2>
              <p className={`mt-2 ${getStatusDisplay(inspections[0].review_status || 'pending_review').textColor}`}>
                {getStatusDisplay(inspections[0].review_status || 'pending_review').message}
              </p>
              
              {inspections[0].review_status === 'rejected' && inspections[0].review_notes && (
                <div className="mt-4 bg-red-100 rounded-lg p-3 text-sm text-red-700">
                  <strong>Reason:</strong> {inspections[0].review_notes}
                </div>
              )}
              
              {inspections[0].review_status === 'approved' && (
                <div className="mt-4 bg-green-100 rounded-lg p-3 text-sm text-green-700">
                  <strong>Approved by:</strong> {inspections[0].reviewed_by || "Safety Manager"}<br />
                  <strong>Time:</strong> {new Date(inspections[0].reviewed_at).toLocaleString()}
                </div>
              )}
              
              <div className="mt-4 flex gap-3">
                {(inspections[0].compliance_photo || inspections[0].photo_url) && (
                  <button
                    onClick={() => setSelectedPhoto(inspections[0].compliance_photo || inspections[0].photo_url)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200"
                  >
                    <IconPhoto size={18} />
                    View Evidence Photo
                  </button>
                )}
                <a
                  href="/inspect"
                  className="flex items-center gap-2 px-4 py-2 bg-[#1D9E75] text-white rounded-lg hover:bg-[#178a64]"
                >
                  Start New Inspection
                </a>
              </div>
            </div>
          </div>
        )}

        {/* History Section */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Inspection History</h2>
            <button onClick={() => fetchInspections(username)} className="text-gray-500 hover:text-gray-700">
              <IconRefresh size={18} />
            </button>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : inspections.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p>No inspections yet</p>
              <p className="text-sm mt-1">Start an inspection to see your history</p>
            </div>
          ) : (
            <div className="divide-y">
              {inspections.map((inspection, index) => {
                const status = getStatusDisplay(inspection.review_status || 'pending_review');
                return (
                  <div key={inspection.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${status.color.replace('bg-', 'bg-')}`}>
                          {status.icon}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">
                            {inspection.site_id} - {inspection.site_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(inspection.created_at).toLocaleString()}
                          </p>
                          {inspection.has_hazard && (
                            <p className="text-xs text-red-500 mt-1">Hazard reported: {inspection.hazard_comment}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${status.color}`}>
                          {status.icon}
                          {status.title}
                        </span>
                        {index === 0 && (
                          <p className="text-xs text-gray-400 mt-1">Most recent</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="max-w-3xl w-full bg-white rounded-xl overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold">Evidence Photo</h3>
              <button onClick={() => setSelectedPhoto(null)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
            </div>
            <img src={selectedPhoto} alt="Evidence" className="w-full" />
          </div>
        </div>
      )}
    </div>
  );
}