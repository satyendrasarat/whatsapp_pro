import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Connections from './pages/Connections';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import FlowBuilder from './pages/FlowBuilder';
import GroupGrabber from './pages/GroupGrabber';
import AIAssistant from './pages/AIAssistant';
import Settings from './pages/Settings';
import LiveChatInbox from './pages/LiveChatInbox';
import { api } from './services/api';
import { playNeedsHumanAlert } from './utils/soundEffects';

export function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [liveSessions, setLiveSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [quickDispatchTarget, setQuickDispatchTarget] = useState(null);

  const fetchGlobalState = async () => {
    try {
      const [analyticsData, sessionsData] = await Promise.all([
        api.getAnalytics().catch(() => ({})),
        api.getSessions().catch(() => ({}))
      ]);
      const sessions = (sessionsData && sessionsData.sessions && sessionsData.sessions.length > 0)
        ? sessionsData.sessions
        : (analyticsData && analyticsData.liveSessions) || [];
      setLiveSessions(sessions);
      if (analyticsData.stats) setStats(analyticsData.stats);
    } catch (err) {
      console.warn('Could not fetch global analytics yet:', err.message);
    }
  };

  useEffect(() => {
    fetchGlobalState();

    const unsubscribe = api.subscribe((event) => {
      if (event.type === 'init_state') {
        if (event.sessions && event.sessions.length > 0) setLiveSessions(event.sessions);
        if (event.stats) setStats(event.stats);
      } else if (
        ['session_update', 'qr', 'connection_open', 'connection_close', 'session_deleted'].includes(
          event.type
        )
      ) {
        fetchGlobalState();
      } else if (event.type === 'human_handover_requested') {
        playNeedsHumanAlert();
      }
    });

    return unsubscribe;
  }, []);

  const pageTitles = {
    dashboard: 'Analytics & Automation Dashboard',
    inbox: 'Live 2-Way Chat Inbox & Operator Takeover',
    connections: 'WhatsApp Accounts & QR Authentication',
    contacts: 'Audience Contacts & List Segmentation',
    campaigns: 'Bulk Campaigns & Queue Dispatcher',
    flows: 'Visual Flow & Chatbot Canvas',
    groups: 'Group Participant Grabber & LID Resolver',
    ai: 'AI Agent & Product Knowledge Studio',
    settings: 'System & Anti-Ban Configuration'
  };

  const primarySession = liveSessions.find((s) => s.status === 'connected') || liveSessions[0] || null;

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        liveSessions={liveSessions}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
        <Header
          title={pageTitles[activeTab] || 'WhatsApp CRM Studio'}
          activeSession={primarySession}
          onRefresh={fetchGlobalState}
          quickDispatchTarget={quickDispatchTarget}
          onCloseQuickDispatch={() => setQuickDispatchTarget(null)}
        />

        <main className="flex-1 overflow-hidden relative">
          {activeTab === 'dashboard' && (
            <Dashboard setActiveTab={setActiveTab} liveSessions={liveSessions} />
          )}
          {activeTab === 'inbox' && <LiveChatInbox />}
          {activeTab === 'connections' && (
            <Connections liveSessions={liveSessions} onRefresh={fetchGlobalState} />
          )}
          {activeTab === 'contacts' && (
            <Contacts onQuickDispatch={(contact) => setQuickDispatchTarget(contact)} />
          )}
          {activeTab === 'campaigns' && <Campaigns liveSessions={liveSessions} />}
          {activeTab === 'flows' && <FlowBuilder />}
          {activeTab === 'groups' && <GroupGrabber liveSessions={liveSessions} />}
          {activeTab === 'ai' && <AIAssistant />}
          {activeTab === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}

export default App;

