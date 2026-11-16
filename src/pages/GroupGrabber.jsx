import React, { useState, useEffect } from 'react';
import {
  Radio,
  Users,
  Download,
  FolderPlus,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowRight
} from 'lucide-react';
import { api } from '../services/api';
import Modal from '../components/Modal';

export const GroupGrabber = ({ liveSessions = [] }) => {
  const [selectedSessionId, setSelectedSessionId] = useState('default');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Import to list modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [targetListName, setTargetListName] = useState('');
  const [lists, setLists] = useState([]);
  const [targetListId, setTargetListId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(null);

  const loadLists = async () => {
    try {
      const res = await api.getLists();
      if (res.lists) setLists(res.lists);
    } catch (e) {}
  };

  const loadGroups = async () => {
    setLoading(true);
    setGroups([]);
    setSelectedGroup(null);
    setGroupMembers([]);
    try {
      const res = await api.getGroups(selectedSessionId);
      if (res.groups) setGroups(res.groups);
    } catch (err) {
      alert(`Could not fetch WhatsApp groups: ${err.message}. Ensure your session is connected!`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLists();
  }, []);

  const handleFetchMembers = async (group) => {
    setSelectedGroup(group);
    setLoadingMembers(true);
    setGroupMembers([]);
    try {
      const res = await api.getGroupMembers(group.id, selectedSessionId);
      if (res.members) {
        setGroupMembers(res.members);
        setTargetListName(`${group.subject} Members`);
      }
    } catch (err) {
      alert(`Failed to extract group members: ${err.message}`);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleSaveToList = async (e) => {
    e.preventDefault();
    if (groupMembers.length === 0) return;
    setImporting(true);
    setImportSuccess(null);
    try {
      const res = await api.importGroupMembers(
        groupMembers,
        targetListName || null,
        targetListId || null
      );
      setImportSuccess(`Successfully imported ${res.importedCount} members into Contact List!`);
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportSuccess(null);
      }, 1500);
      await loadLists();
    } catch (err) {
      alert(`Import error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const filteredGroups = groups.filter((g) =>
    (g.subject || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400" />
            WhatsApp Group Grabber & LID Resolver
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Extract members and admins from joined WhatsApp groups and resolve hidden Linked Identities (@lid) into real phone numbers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs font-semibold text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500"
          >
            <option value="default">Default WhatsApp</option>
            {liveSessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.sessionName || s.sessionId} ({s.status})
              </option>
            ))}
          </select>

          <button
            onClick={loadGroups}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/30 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Fetching Groups...' : 'Load Joined Groups'}</span>
          </button>
        </div>
      </div>

      {/* Two Column Layout: Groups List & Members Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Groups List */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[580px]">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search groups by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
              {filteredGroups.length} groups
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {groups.length === 0 ? (
              <div className="text-center py-20 text-slate-500 text-xs px-4">
                {loading
                  ? 'Connecting to Baileys engine and fetching group metadata...'
                  : 'Click "Load Joined Groups" above to fetch your participating WhatsApp groups.'}
              </div>
            ) : (
              filteredGroups.map((g) => {
                const isSelected = selectedGroup?.id === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => handleFetchMembers(g)}
                    className={`p-4 cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-950/30 border-l-4 border-emerald-500'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{g.subject}</h4>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate max-w-xs">
                        {g.id}
                      </p>
                      {g.desc && (
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1 italic">
                          {g.desc}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="bg-slate-800 text-slate-300 font-semibold px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                        <Users className="w-3 h-3 text-emerald-400" />
                        <span>{g.size}</span>
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Extracted Members with LID Resolution */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[580px]">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
            <div>
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                {selectedGroup ? selectedGroup.subject : 'Select a Group to Extract Members'}
              </h3>
              {selectedGroup && (
                <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">
                  {groupMembers.length} participants resolved with LID mapping
                </p>
              )}
            </div>

            {groupMembers.length > 0 && (
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-md transition"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Save to Contact List</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingMembers ? (
              <div className="text-center py-24 text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                <span>Resolving LID participants using Signal repository cache...</span>
              </div>
            ) : groupMembers.length === 0 ? (
              <div className="text-center py-24 text-slate-500 text-xs px-6">
                Click any WhatsApp group from the left column to extract member phone numbers and admins.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 sticky top-0 text-slate-400 font-bold uppercase">
                  <tr>
                    <th className="p-3">Phone Number</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">JID Identifier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {groupMembers.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono font-bold text-emerald-400">
                        +{m.phone}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            m.isAdmin
                              ? 'bg-amber-900/60 text-amber-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {m.adminRole}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-500 truncate max-w-xs">
                        {m.jid}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Save to Contact List Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Group Members into Contact List"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveToList} className="space-y-4">
          <p className="text-xs text-slate-300">
            Importing <strong>{groupMembers.length}</strong> members from <strong>{selectedGroup?.subject}</strong>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Select Existing List
            </label>
            <select
              value={targetListId}
              onChange={(e) => setTargetListId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Or create new list below...</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              New List Name
            </label>
            <input
              type="text"
              placeholder="e.g. Crypto Group Leads"
              value={targetListName}
              onChange={(e) => setTargetListName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-semibold"
            />
          </div>

          {importSuccess && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 font-semibold">
              {importSuccess}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={importing}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-emerald-600/30"
            >
              {importing ? 'Importing...' : 'Save to Contacts & List'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default GroupGrabber;

