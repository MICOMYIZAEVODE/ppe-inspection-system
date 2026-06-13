import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  IconUserPlus, 
  IconUserCheck, 
  IconUserX, 
  IconRefresh,
  IconId,
  IconMail,
  IconPhone,
  IconUser,
  IconEdit,
  IconTrash,
  IconLock
} from "@tabler/icons-react";

export const Route = createFileRoute("/dashboard/workers")({
  component: WorkersManagement,
});

function WorkersManagement() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showEditWorker, setShowEditWorker] = useState(false);
  const [editingWorker, setEditingWorker] = useState<any>(null);
  const [newWorker, setNewWorker] = useState({
    worker_id: "",
    password: "",
    full_name: "",
    email: "",
    phone: ""
  });
  const [editWorkerData, setEditWorkerData] = useState({
    id: "",
    worker_id: "",
    full_name: "",
    email: "",
    phone: "",
    new_password: ""
  });

  const fetchWorkers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("workers")
      .select("*")
      .order("created_at", { ascending: false });
    
    setWorkers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  const handleAddWorker = async () => {
    if (!newWorker.worker_id || !newWorker.password) {
      alert("Worker ID and Password are required");
      return;
    }

    const { error } = await supabase.from("workers").insert({
      worker_id: newWorker.worker_id.toUpperCase(),
      username: newWorker.worker_id.toUpperCase(),
      password_hash: newWorker.password,
      full_name: newWorker.full_name,
      email: newWorker.email,
      phone: newWorker.phone,
      status: "active"
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Worker added successfully!");
      setNewWorker({ worker_id: "", password: "", full_name: "", email: "", phone: "" });
      setShowAddWorker(false);
      fetchWorkers();
    }
  };

  const handleEditWorker = async () => {
    if (!editWorkerData.worker_id) {
      alert("Worker ID is required");
      return;
    }

    const updateData: any = {
      worker_id: editWorkerData.worker_id.toUpperCase(),
      username: editWorkerData.worker_id.toUpperCase(),
      full_name: editWorkerData.full_name,
      email: editWorkerData.email,
      phone: editWorkerData.phone,
      updated_at: new Date().toISOString()
    };

    // Only update password if a new one is provided
    if (editWorkerData.new_password && editWorkerData.new_password.trim() !== "") {
      updateData.password_hash = editWorkerData.new_password;
    }

    const { error } = await supabase
      .from("workers")
      .update(updateData)
      .eq("id", editWorkerData.id);

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Worker updated successfully!");
      setShowEditWorker(false);
      setEditingWorker(null);
      setEditWorkerData({ id: "", worker_id: "", full_name: "", email: "", phone: "", new_password: "" });
      fetchWorkers();
    }
  };

  const openEditModal = (worker: any) => {
    setEditingWorker(worker);
    setEditWorkerData({
      id: worker.id,
      worker_id: worker.worker_id || worker.username,
      full_name: worker.full_name || "",
      email: worker.email || "",
      phone: worker.phone || "",
      new_password: ""
    });
    setShowEditWorker(true);
  };

  const toggleWorkerStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const { error } = await supabase
      .from("workers")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      alert("Error: " + error.message);
    } else {
      fetchWorkers();
    }
  };

  const activeCount = workers.filter(w => w.status === "active").length;
  const inactiveCount = workers.filter(w => w.status === "inactive").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Workers Management</h1>
          <p className="text-gray-500 text-sm">Add, edit, activate, or deactivate worker accounts</p>
        </div>
        <button 
          onClick={() => setShowAddWorker(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <IconUserPlus size={18} />
          Add Worker
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-blue-500">
          <p className="text-gray-500 text-sm">Total Workers</p>
          <p className="text-3xl font-bold text-blue-600">{workers.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-green-500">
          <p className="text-gray-500 text-sm">Active</p>
          <p className="text-3xl font-bold text-green-600">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5 border-l-4 border-red-500">
          <p className="text-gray-500 text-sm">Inactive</p>
          <p className="text-3xl font-bold text-red-600">{inactiveCount}</p>
        </div>
      </div>

      {/* Workers Table */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Workers List</h2>
          <button onClick={fetchWorkers} className="text-gray-500 hover:text-gray-700">
            <IconRefresh size={18} />
          </button>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : workers.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p>No workers yet</p>
            <p className="text-sm mt-1">Click "Add Worker" to create accounts</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Worker ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Full Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {workers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <IconId size={16} className="text-gray-400" />
                        <span className="font-mono text-sm font-semibold">{worker.worker_id || worker.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <IconUser size={14} className="text-gray-400" />
                        {worker.full_name || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <IconMail size={14} className="text-gray-400" />
                        {worker.email || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <IconPhone size={14} className="text-gray-400" />
                        {worker.phone || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        worker.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {worker.status === "active" ? <IconUserCheck size={12} /> : <IconUserX size={12} />}
                        {worker.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(worker)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Edit Worker"
                        >
                          <IconEdit size={18} />
                        </button>
                        <button
                          onClick={() => toggleWorkerStatus(worker.id, worker.status)}
                          className={`p-1.5 rounded-lg transition ${
                            worker.status === "active" 
                              ? "text-red-600 hover:bg-red-50" 
                              : "text-green-600 hover:bg-green-50"
                          }`}
                          title={worker.status === "active" ? "Deactivate" : "Activate"}
                        >
                          {worker.status === "active" ? <IconUserX size={18} /> : <IconUserCheck size={18} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Worker Modal */}
      {showAddWorker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Add New Worker</h3>
              <button onClick={() => setShowAddWorker(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Worker ID *</label>
                <input
                  type="text"
                  placeholder="e.g., W001, EMP001"
                  value={newWorker.worker_id}
                  onChange={(e) => setNewWorker({...newWorker, worker_id: e.target.value.toUpperCase()})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  placeholder="Enter password"
                  value={newWorker.password}
                  onChange={(e) => setNewWorker({...newWorker, password: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={newWorker.full_name}
                  onChange={(e) => setNewWorker({...newWorker, full_name: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="Email"
                  value={newWorker.email}
                  onChange={(e) => setNewWorker({...newWorker, email: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  placeholder="Phone"
                  value={newWorker.phone}
                  onChange={(e) => setNewWorker({...newWorker, phone: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowAddWorker(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleAddWorker} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Add Worker
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Worker Modal */}
      {showEditWorker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Edit Worker</h3>
              <button onClick={() => setShowEditWorker(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Worker ID *</label>
                <input
                  type="text"
                  value={editWorkerData.worker_id}
                  onChange={(e) => setEditWorkerData({...editWorkerData, worker_id: e.target.value.toUpperCase()})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password (leave blank to keep current)</label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={editWorkerData.new_password}
                  onChange={(e) => setEditWorkerData({...editWorkerData, new_password: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editWorkerData.full_name}
                  onChange={(e) => setEditWorkerData({...editWorkerData, full_name: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editWorkerData.email}
                  onChange={(e) => setEditWorkerData({...editWorkerData, email: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editWorkerData.phone}
                  onChange={(e) => setEditWorkerData({...editWorkerData, phone: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowEditWorker(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleEditWorker} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}