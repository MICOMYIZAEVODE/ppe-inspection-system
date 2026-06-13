import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  IconAlertTriangle, 
  IconCheck, 
  IconPhoto, 
  IconCalendar, 
  IconUser, 
  IconMapPin,
  IconRefresh,
  IconDownload,
  IconClock,
  IconX
} from "@tabler/icons-react";

export const Route = createFileRoute("/dashboard/inspections")({
  component: InspectionsPage,
});

function InspectionsPage() {
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchInspections = async () => {
    setLoading(true);
    let query = supabase
      .from("compliance_records")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (filter === "pending") {
      query = query.eq("review_status", "pending_review");
    } else if (filter === "approved") {
      query = query.eq("review_status", "approved");
    } else if (filter === "rejected") {
      query = query.eq("review_status", "rejected");
    } else if (filter === "hazards") {
      query = query.eq("has_hazard", true);
    } else if (filter === "compliant") {
      query = query.eq("compliant", true);
    }
    
    const { data } = await query;
    setInspections(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchInspections();
    
    const subscription = supabase
      .channel("inspections_update")
      .on("postgres_changes", 
        { event: "*", schema: "public", table: "compliance_records" },
        () => fetchInspections()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [filter]);

  async function approveInspection(id: string, workerId: string, siteId: string, siteName: string) {
    setActionInProgress(id);
    try {
      const { error } = await supabase
        .from("compliance_records")
        .update({
          review_status: "approved",
          clearance_granted: true,
          reviewed_at: new Date().toISOString(),
          reviewed_by: "Safety Manager"
        })
        .eq("id", id);
      
      if (error) {
        alert("Error: " + error.message);
      } else {
        alert(`✅ Clearance granted for ${workerId}`);
        
        // Send notification to worker
        await supabase.from("notifications").insert({
          username: workerId,
          site_id: siteId,
          site_name: siteName,
          message: `✅ Your PPE inspection at ${siteId} / ${siteName} has been APPROVED. You may climb the tower.`,
          type: "approved",
          is_read: false,
          created_at: new Date().toISOString()
        });
        
        fetchInspections();
      }
    } catch (err) {
      alert("Error: " + (err as Error).message);
    }
    setActionInProgress(null);
  }

  async function rejectInspection(id: string, workerId: string, siteId: string, siteName: string) {
    const reason = prompt("Enter reason for rejection (required):");
    if (!reason) return;
    
    setActionInProgress(id);
    try {
      const { error } = await supabase
        .from("compliance_records")
        .update({
          review_status: "rejected",
          clearance_granted: false,
          reviewed_at: new Date().toISOString(),
          reviewed_by: "Safety Manager",
          review_notes: reason
        })
        .eq("id", id);
      
      if (error) {
        alert("Error: " + error.message);
      } else {
        alert(`❌ Clearance denied for ${workerId}`);
        
        // Send notification to worker
        await supabase.from("notifications").insert({
          username: workerId,
          site_id: siteId,
          site_name: siteName,
          message: `❌ Your PPE inspection at ${siteId} / ${siteName} was REJECTED. Reason: ${reason}`,
          type: "rejected",
          is_read: false,
          created_at: new Date().toISOString()
        });
        
        fetchInspections();
      }
    } catch (err) {
      alert("Error: " + (err as Error).message);
    }
    setActionInProgress(null);
  }

  const exportToCSV = () => {
    const headers = ["Worker", "Site ID", "Site Name", "Time", "Hazard", "Hazard Comment", "Review Status", "Cleared", "Review Notes"];
    const rows = inspections.map(i => [
      i.username || i.worker_id,
      i.site_id,
      i.site_name,
      new Date(i.created_at).toLocaleString(),
      i.has_hazard ? "Yes" : "No",
      i.hazard_comment || "",
      i.review_status || "pending_review",
      i.clearance_granted ? "Yes" : "No",
      i.review_notes || ""
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspections_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'approved':
        return { color: "bg-green-100 text-green-800", icon: <IconCheck size={14} />, text: "✅ Approved" };
      case 'rejected':
        return { color: "bg-red-100 text-red-800", icon: <IconX size={14} />, text: "❌ Rejected" };
      default:
        return { color: "bg-yellow-100 text-yellow-800", icon: <IconClock size={14} />, text: "⏳ Pending Review" };
    }
  };

  const pendingCount = inspections.filter(i => i.review_status === 'pending_review' || !i.review_status).length;
  const approvedCount = inspections.filter(i => i.review_status === 'approved').length;
  const rejectedCount = inspections.filter(i => i.review_status === 'rejected').length;

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-yellow-500">
          <p className="text-gray-500 text-sm">Pending Review</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
          <p className="text-gray-500 text-sm">Approved</p>
          <p className="text-2xl font-bold text-green-600">{approvedCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-red-500">
          <p className="text-gray-500 text-sm">Rejected</p>
          <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
          <p className="text-gray-500 text-sm">Total</p>
          <p className="text-2xl font-bold text-blue-600">{inspections.length}</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b flex flex-wrap justify-between items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-800">📋 Inspections Manager</h2>
          <div className="flex gap-2">
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm"
            >
              <option value="all">All Inspections</option>
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="hazards">With Hazards</option>
              <option value="compliant">Compliant</option>
            </select>
            <button onClick={fetchInspections} className="p-2 text-gray-500 hover:text-gray-700 border rounded-lg">
              <IconRefresh size={18} />
            </button>
            <button onClick={exportToCSV} className="p-2 text-gray-500 hover:text-gray-700 border rounded-lg">
              <IconDownload size={18} />
            </button>
          </div>
        </div>
        
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading inspections...</div>
        ) : inspections.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p>No inspections found</p>
            <p className="text-sm mt-1">Start an inspection to see results here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Worker</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Site</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date & Time</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Hazard</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Photo</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inspections.map((inspection) => {
                  const status = getStatusBadge(inspection.review_status || 'pending_review');
                  const isPending = !inspection.review_status || inspection.review_status === 'pending_review';
                  
                  return (
                    <tr key={inspection.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <IconUser size={16} className="text-gray-400" />
                          <span className="font-medium">{inspection.username || inspection.worker_id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <IconMapPin size={16} className="text-gray-400" />
                          <span>{inspection.site_id}</span>
                          <span className="text-gray-400 text-xs">({inspection.site_name})</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <IconCalendar size={14} className="text-gray-400" />
                          <span className="text-sm">{new Date(inspection.created_at).toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {inspection.has_hazard ? (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs w-fit">
                              <IconAlertTriangle size={12} />
                              Hazard Reported
                            </span>
                            {inspection.hazard_comment && (
                              <span className="text-xs text-gray-500 max-w-xs">{inspection.hazard_comment}</span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                            <IconCheck size={12} />
                            No Hazards
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {(inspection.photo_url || inspection.compliance_photo) ? (
                          <button
                            onClick={() => setSelectedPhoto(inspection.compliance_photo || inspection.photo_url)}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
                          >
                            <IconPhoto size={16} />
                            View Evidence
                          </button>
                        ) : (
                          <span className="text-gray-400 text-sm">No photo</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${status.color}`}>
                          {status.icon}
                          {status.text}
                        </span>
                        {inspection.review_notes && (
                          <div className="text-xs text-gray-500 mt-1 max-w-xs">
                            Note: {inspection.review_notes}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isPending ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => approveInspection(
                                inspection.id, 
                                inspection.username || inspection.worker_id,
                                inspection.site_id,
                                inspection.site_name
                              )}
                              disabled={actionInProgress === inspection.id}
                              className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                            >
                              {actionInProgress === inspection.id ? "..." : "✅ Approve"}
                            </button>
                            <button
                              onClick={() => rejectInspection(
                                inspection.id, 
                                inspection.username || inspection.worker_id,
                                inspection.site_id,
                                inspection.site_name
                              )}
                              disabled={actionInProgress === inspection.id}
                              className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:opacity-50"
                            >
                              {actionInProgress === inspection.id ? "..." : "❌ Reject"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {inspection.reviewed_by || "System"} · {inspection.reviewed_at ? new Date(inspection.reviewed_at).toLocaleDateString() : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
            <div className="p-4 bg-gray-50 text-sm text-gray-500">
              <p>📸 This photo was captured at the time of inspection</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}