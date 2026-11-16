import React from 'react';
import {
  LayoutDashboard,
  QrCode,
  Users,
  Send,
  Workflow,
  Sparkles,
  Settings as SettingsIcon,
  MessageCircle,
  MessageSquare,
  Radio
} from 'lucide-react';

export const Sidebar = ({ activeTab, setActiveTab, liveSessions = [] }) => {
  const connectedSession = liveSessions.find((s) => s.status === 'connected');
  const primarySession = connectedSession || liveSessions[0] || {};
  const isConnected = !!connectedSession || primarySession.status === 'connected';

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inbox', label: 'Live Chat Inbox', icon: MessageSquare },
    { id: 'connections', label: 'WhatsApp Accounts', icon: QrCode, badge: isConnected ? 'Online' : 'Scan QR' },
    { id: 'contacts', label: 'Contacts & Lists', icon: Users },
    { id: 'campaigns', label: 'Bulk Campaigns', icon: Send },
    { id: 'flows', label: 'Visual Flow Builder', icon: Workflow },
    { id: 'groups', label: 'Group Grabber', icon: Radio },
    { id: 'ai', label: 'AI Agent & Catalog', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-screen select-none">
      {/* Brand Logo */}
      <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white font-black text-xl">
          <MessageCircle className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-extrabold text-slate-100 text-base leading-tight tracking-tight">WhatsApp CRM</h1>
          <p className="text-[11px] font-medium text-emerald-400 flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
            Automation Studio
          </p>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isActive
                      ? 'bg-emerald-800 text-emerald-200'
                      : isConnected
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Account Status Footer Widget */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Session Status</span>
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-amber-400 animate-ping'
            }`}
          />
        </div>
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
          <p className="font-semibold text-slate-200 truncate">{primarySession.sessionName || 'Default Session'}</p>
          <p className="text-slate-400 mt-0.5 text-[11px] truncate">
            {primarySession.phoneNumber ? `+${primarySession.phoneNumber}` : (primarySession.status || 'Offline')}
          </p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

