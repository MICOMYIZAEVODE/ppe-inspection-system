import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { 
  IconLayoutDashboard, 
  IconUsers, 
  IconClipboardList, 
  IconChartBar, 
  IconSettings,
  IconBell,
  IconLogout,
  IconAlertTriangle,
  IconCheck,
  IconEye,
  IconRefresh,
  IconCamera,
  IconClock
} from "@tabler/icons-react";

// ============================================
// 404 NOT FOUND COMPONENT
// ============================================
function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-sm p-8 text-center max-w-md">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Page Not Found</h2>
        <p className="text-gray-600 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link 
          to="/dashboard" 
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          <IconLayoutDashboard size={18} />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
  notFoundComponent: NotFound,
});

function DashboardLayout() {
  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    compliant: 0,
    hazards: 0
  });
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentInspections, setRecentInspections] = useState<any[]>([]);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminName, setAdminName] = useState("");

  // Check admin login
  useEffect(() => {
    const isAdminLoggedIn = localStorage.getItem("admin_logged_in");
    const adminEmail = localStorage.getItem("admin_email");
    const adminSavedName = localStorage.getItem("admin_name");
    
    if (!isAdminLoggedIn) {
      window.location.href = "/dashboard/login";
      return;
    }
    
    if (adminSavedName) {
      setAdminName(adminSavedName);
    } else if (adminEmail) {
      setAdminName(adminEmail.split("@")[0]);
    } else {
      setAdminName("Manager");
    }
  }, []);

  // Function to fetch all data
  const fetchDashboardData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    console.log("🔄 Fetching dashboard data at:", new Date().toLocaleTimeString());
    
    try {
      // Fetch compliance records
      const { data: records, error: recordsError } = await supabase
        .from("compliance_records")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (recordsError) {
        console.error("❌ Records error:", recordsError);
      } else if (records) {
        console.log(`✅ Found ${records.length} compliance records`);
        
        const today = new Date().toDateString();
        const todayRecords = records.filter(r => new Date(r.created_at).toDateString() === today);
        
        const total = records.length;
        const compliant = records.filter(r => r.has_hazard === false || r.has_hazard === null).length;
        const hazards = records.filter(r => r.has_hazard === true).length;
        
        setStats({
          total: total,
          today: todayRecords.length,
          compliant: compliant,
          hazards: hazards
        });
        
        setRecentInspections(records.slice(0, 5));
      }
      
      // Fetch notifications
      const { data: notifications, error: notifError } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (notifError) {
        console.error("❌ Notifications error:", notifError);
      } else if (notifications) {
        console.log(`✅ Found ${notifications.length} notifications`);
        setRecentNotifications(notifications);
        setUnreadCount(notifications.filter(n => !n.is_read).length);
      }
      
      setLastUpdated(new Date());
    } catch (error) {
      console.error("❌ Fetch error:", error);
    }
    
    setLoading(false);
    if (showRefresh) setIsRefreshing(false);
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    // Initial fetch
    fetchDashboardData();
    
    // Subscribe to compliance_records changes
    const recordsSubscription = supabase
      .channel("dashboard_records")
      .on("postgres_changes", 
        { event: "INSERT", schema: "public", table: "compliance_records" },
        (payload) => {
          console.log("🆕 NEW INSPECTION ADDED! Refreshing...", payload.new);
          fetchDashboardData(true);
        }
      )
      .on("postgres_changes", 
        { event: "UPDATE", schema: "public", table: "compliance_records" },
        (payload) => {
          console.log("✏️ Inspection updated! Refreshing...", payload.new);
          fetchDashboardData(true);
        }
      )
      .subscribe();

    // Subscribe to notifications changes
    const notificationsSubscription = supabase
      .channel("dashboard_notifications")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          console.log("🔔 NEW NOTIFICATION! Refreshing...", payload.new);
          fetchDashboardData(true);
        }
      )
      .subscribe();

    // Polling fallback - refreshes every 5 seconds
    const pollInterval = setInterval(() => {
      console.log("🔄 Polling for dashboard updates...");
      fetchDashboardData();
    }, 5000);

    // Cleanup subscriptions
    return () => {
      recordsSubscription.unsubscribe();
      notificationsSubscription.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [fetchDashboardData]);

  const getNotificationIcon = (type: string) => {
    switch(type) {
      case 'compliant': return <IconCheck size={14} className="text-green-600" />;
      case 'violation_persisting': return <IconAlertTriangle size={14} className="text-red-600" />;
      default: return <IconEye size={14} className="text-blue-600" />;
    }
  };

  const getNotificationBg = (type: string) => {
    switch(type) {
      case 'compliant': return 'bg-green-100';
      case 'violation_persisting': return 'bg-red-100';
      default: return 'bg-blue-100';
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_logged_in");
    localStorage.removeItem("admin_email");
    localStorage.removeItem("admin_name");
    window.location.href = "/dashboard/login";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-72 bg-white shadow-lg flex flex-col fixed h-full z-10">
        <div className="p-6 border-b bg-gradient-to-r from-blue-600 to-blue-700">
          <h1 className="text-xl font-bold text-white">🪖 PPE Safety System</h1>
          <p className="text-xs text-blue-100 mt-1">Welcome, {adminName}</p>
        </div>
        
        <nav className="p-4 space-y-1 flex-1">
          <Link to="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-all [&.active]:bg-blue-50 [&.active]:text-blue-600 [&.active]:border-r-4 [&.active]:border-blue-600">
            <IconLayoutDashboard size={20} />
            <span className="font-medium">Dashboard</span>
          </Link>
          <Link to="/dashboard/inspections" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-all [&.active]:bg-blue-50 [&.active]:text-blue-600 [&.active]:border-r-4 [&.active]:border-blue-600">
            <IconClipboardList size={20} />
            <span className="font-medium">Inspections</span>
          </Link>
          <Link to="/dashboard/workers" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-all [&.active]:bg-blue-50 [&.active]:text-blue-600 [&.active]:border-r-4 [&.active]:border-blue-600">
            <IconUsers size={20} />
            <span className="font-medium">Workers</span>
          </Link>
          <Link to="/dashboard/analytics" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-all [&.active]:bg-blue-50 [&.active]:text-blue-600 [&.active]:border-r-4 [&.active]:border-blue-600">
            <IconChartBar size={20} />
            <span className="font-medium">Analytics</span>
          </Link>
          <Link to="/dashboard/settings" className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-all [&.active]:bg-blue-50 [&.active]:text-blue-600 [&.active]:border-r-4 [&.active]:border-blue-600">
            <IconSettings size={20} />
            <span className="font-medium">Settings</span>
          </Link>
        </nav>
        
        <div className="p-4 border-t">
          <a 
            href="/inspect"
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-all"
          >
            <IconCamera size={20} />
            <span className="font-medium">New Inspection</span>
          </a>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-red-600 hover:bg-red-50 mt-2 transition-all"
          >
            <IconLogout size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-72 p-6">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Safety Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Monitor PPE compliance and worker safety in real-time</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <p className="text-xs text-gray-400">Live Updates Active</p>
            </div>
            <p className="text-xs text-gray-400">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
            <button 
              onClick={() => fetchDashboardData(true)} 
              disabled={isRefreshing}
              className="p-2 text-gray-500 hover:text-gray-700 bg-white rounded-lg shadow-sm disabled:opacity-50"
            >
              <IconRefresh size={18} className={isRefreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Inspections</p>
                <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <IconEye size={24} className="text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-cyan-500 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Today</p>
                <p className="text-3xl font-bold text-cyan-600">{stats.today}</p>
              </div>
              <div className="bg-cyan-100 p-3 rounded-full">
                <IconClock size={24} className="text-cyan-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-green-500 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Compliant</p>
                <p className="text-3xl font-bold text-green-600">{stats.compliant}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <IconCheck size={24} className="text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-red-500 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Hazards</p>
                <p className="text-3xl font-bold text-red-600">{stats.hazards}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
                <IconAlertTriangle size={24} className="text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Inspections */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">📋 Recent Inspections</h2>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : recentInspections.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <IconCamera size={40} className="mx-auto mb-2 opacity-50" />
                  <p>No inspections yet</p>
                  <p className="text-xs mt-1">Click "New Inspection" to start</p>
                </div>
              ) : (
                recentInspections.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${item.has_hazard ? 'bg-red-100' : 'bg-green-100'}`}>
                          {item.has_hazard ? (
                            <IconAlertTriangle size={16} className="text-red-600" />
                          ) : (
                            <IconCheck size={16} className="text-green-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{item.username || item.worker_id}</p>
                          <p className="text-xs text-gray-500">{item.site_id}</p>
                          {item.has_hazard && item.hazard_comment && (
                            <p className="text-xs text-red-500 mt-1">⚠️ {item.hazard_comment}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {new Date(item.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(item.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Notifications */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-800">🔔 Recent Notifications</h2>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="divide-y max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-gray-400">Loading...</div>
              ) : recentNotifications.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <IconBell size={40} className="mx-auto mb-2 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                recentNotifications.map((notif) => (
                  <div key={notif.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${getNotificationBg(notif.type)}`}>
                        {getNotificationIcon(notif.type)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-800">{notif.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(notif.created_at).toLocaleString()}
                        </p>
                        {notif.photo_url && (
                          <button 
                            onClick={() => window.open(notif.photo_url, '_blank')}
                            className="text-xs text-blue-600 hover:underline mt-1"
                          >
                            📸 View Evidence Photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Live Status Indicator */}
        <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600">Dashboard is live</span>
              <span className="text-xs text-gray-400">Updates appear automatically</span>
            </div>
            <div className="text-xs text-gray-400">
              Connected to Supabase • Real-time sync active
            </div>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  );
}