import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  IconBell, 
  IconCheck, 
  IconAlertTriangle, 
  IconEye, 
  IconRefresh,
  IconMail
} from "@tabler/icons-react";

export const Route = createFileRoute("/dashboard/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchNotifications = async () => {
    setLoading(true);
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (filter !== "all") {
      query = query.eq("type", filter);
    }
    
    const { data } = await query;
    setNotifications(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
    
    const subscription = supabase
      .channel("notifications_page")
      .on("postgres_changes", 
        { event: "*", schema: "public", table: "notifications" },
        () => fetchNotifications()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [filter]);

  const markAsRead = async (id: number) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    fetchNotifications();
  };

  const markAllRead = async () => {
    await supabase.from("notifications").update({ is_read: true }).neq("is_read", true);
    fetchNotifications();
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'compliant': return <IconCheck size={20} className="text-green-600" />;
      case 'violation_persisting': return <IconAlertTriangle size={20} className="text-red-600" />;
      default: return <IconEye size={20} className="text-blue-600" />;
    }
  };

  const getBg = (type: string) => {
    switch(type) {
      case 'compliant': return 'bg-green-50 border-green-200';
      case 'violation_persisting': return 'bg-red-50 border-red-200';
      default: return 'bg-blue-50 border-blue-200';
    }
  };

  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'compliant': return '✅ Compliance Achieved';
      case 'violation_persisting': return '⚠️ Violation Alert';
      case 'camera_started': return '📷 Inspection Started';
      default: return '📋 General';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <IconBell size={28} className="text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-800">Notifications Center</h2>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm"
            >
              <option value="all">All Types</option>
              <option value="camera_started">Inspection Started</option>
              <option value="violation_persisting">Violations</option>
              <option value="compliant">Compliance</option>
            </select>
            {unreadCount > 0 && (
              <button 
                onClick={markAllRead} 
                className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 border rounded-lg"
              >
                Mark all read
              </button>
            )}
            <button 
              onClick={fetchNotifications} 
              className="p-2 text-gray-500 hover:text-gray-700 border rounded-lg"
            >
              <IconRefresh size={18} />
            </button>
          </div>
        </div>
        
        <div className="divide-y max-h-[calc(100vh-250px)] overflow-y-auto">
          {loading ? (
            <div className="p-12 text-center text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <p>Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <IconBell size={48} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium">No notifications yet</p>
              <p className="text-sm mt-1">When workers start inspections, notifications will appear here</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div 
                key={notif.id} 
                className={`p-5 hover:bg-gray-50 transition-colors ${!notif.is_read ? 'bg-blue-50/30 border-l-4 border-l-blue-500' : ''}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-full ${getBg(notif.type)} border`}>
                    {getIcon(notif.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {getTypeLabel(notif.type)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(notif.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-gray-700">{notif.message}</p>
                    <div className="flex items-center gap-4 mt-2">
                      {notif.site_id && (
                        <p className="text-xs text-gray-400">📍 Site: {notif.site_id}</p>
                      )}
                      {notif.username && (
                        <p className="text-xs text-gray-400">👤 Worker: {notif.username}</p>
                      )}
                    </div>
                  </div>
                  {!notif.is_read && (
                    <button 
                      onClick={() => markAsRead(notif.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}