import { createFileRoute, Link } from "@tanstack/react-router";
import { TowerIcon } from "@/components/TowerIcon";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-sm p-10 text-center">
        <div className="flex justify-center mb-4">
          <TowerIcon className="w-16 h-16 text-[#1D9E75]" />
        </div>
        <h1 className="text-3xl font-bold text-[#0F172A]">PPE Inspection System</h1>
        <p className="text-gray-500 mt-2">Telecom tower safety compliance</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link to="/inspect" className="bg-[#1D9E75] hover:bg-[#178a64] text-white font-semibold px-6 py-3 rounded-lg transition">
            Worker Inspection
          </Link>
          <Link to="/dashboard/login" className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-semibold px-6 py-3 rounded-lg transition">
            Admin Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
<a href="/admin/login" className="text-sm text-gray-600 hover:text-gray-900">
  Admin Login
</a>
}
