import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  FileSpreadsheet,
  Trash2,
  Edit2,
  FolderPlus,
  Search,
  Download,
  CheckCircle,
  Tag,
  Send,
  CheckSquare,
  Square,
  FolderEdit,
  X,
  Filter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { api } from '../services/api';
import Modal from '../components/Modal';

export const Contacts = ({ onQuickDispatch }) => {
  const [contacts, setContacts] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedContactIds, setSelectedContactIds] = useState(new Set());

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isNewListModalOpen, setIsNewListModalOpen] = useState(false);
  const [isEditListModalOpen, setIsEditListModalOpen] = useState(false);
  const [isQuickMsgOpen, setIsQuickMsgOpen] = useState(false);

  // Forms state
  const [contactForm, setContactForm] = useState({
    id: null,
    phone: '',
    name: '',
    notes: '',
    tags: '',
    list_ids: []
  });

  const [listForm, setListForm] = useState({
    id: null,
    name: '',
    description: ''
  });

  const [quickMsg, setQuickMsg] = useState({
    phone: '',
    name: '',
    text: '',
    sending: false,
    result: null
  });

  // Import state
  const [importRows, setImportRows] = useState([]);
  const [importTargetList, setImportTargetList] = useState('');
  const [importNewListName, setImportNewListName] = useState('');
  const [importProgress, setImportProgress] = useState(null);

  const loadData = async (listId = selectedListId) => {
    setLoading(true);
    try {
      const [cData, lData] = await Promise.all([
        api.getContacts(listId),
        api.getLists()
      ]);
      if (cData.contacts) setContacts(cData.contacts);
      if (lData.lists) setLists(lData.lists);
    } catch (err) {
      console.error('Failed to load contacts/lists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedListId);
    setSelectedContactIds(new Set());
  }, [selectedListId]);

  const handleSelectAll = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map((c) => c.id)));
    }
  };

  const handleToggleSelect = (id) => {
    const next = new Set(selectedContactIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedContactIds(next);
  };

  // Create or Update Contact
  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (!contactForm.phone) return;
    try {
      if (contactForm.id) {
        await api.updateContact(contactForm.id, contactForm);
      } else {
        await api.createContact(contactForm);
      }
      setIsAddModalOpen(false);
      setIsEditModalOpen(false);
      setContactForm({ id: null, phone: '', name: '', notes: '', tags: '', list_ids: [] });
      await loadData();
    } catch (err) {
      alert(`Error saving contact: ${err.message}`);
    }
  };

  const openEditContact = (c) => {
    const listIds = c.list_ids ? c.list_ids.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean) : [];
    setContactForm({
      id: c.id,
      phone: c.phone,
      name: c.name || '',
      notes: c.notes || '',
      tags: c.tags || '',
      list_ids: listIds
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteContact = async (id) => {
    if (!window.confirm('Delete this contact permanently?')) return;
    try {
      await api.deleteContact(id);
      await loadData();
    } catch (err) {
      alert(`Error deleting contact: ${err.message}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedContactIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedContactIds.size} selected contacts?`)) return;
    try {
      await api.bulkDeleteContacts(Array.from(selectedContactIds));
      setSelectedContactIds(new Set());
      await loadData();
    } catch (err) {
      alert(`Bulk delete failed: ${err.message}`);
    }
  };

  // List Handlers
  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!listForm.name) return;
    try {
      await api.createList(listForm.name, listForm.description);
      setListForm({ id: null, name: '', description: '' });
      setIsNewListModalOpen(false);
      await loadData();
    } catch (err) {
      alert(`Error creating list: ${err.message}`);
    }
  };

  const openEditList = (list, e) => {
    e.stopPropagation();
    setListForm({ id: list.id, name: list.name, description: list.description || '' });
    setIsEditListModalOpen(true);
  };

  const handleUpdateList = async (e) => {
    e.preventDefault();
    if (!listForm.name) return;
    try {
      await api.updateList(listForm.id, listForm.name, listForm.description);
      setIsEditListModalOpen(false);
      setListForm({ id: null, name: '', description: '' });
      await loadData();
    } catch (err) {
      alert(`Error updating list: ${err.message}`);
    }
  };

  const handleDeleteList = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this list? Contacts will not be deleted.')) return;
    try {
      await api.deleteList(id);
      if (selectedListId === id) setSelectedListId(null);
      await loadData();
    } catch (err) {
      alert(`Error deleting list: ${err.message}`);
    }
  };

  // Export Contacts to CSV
  const handleExportCSV = () => {
    const dataToExport = contacts.map((c) => ({
      Phone: `+${c.phone}`,
      Name: c.name || '',
      Lists: c.list_names || '',
      Notes: c.notes || '',
      Tags: c.tags || '',
      Created: c.created_at || ''
    }));

    const csvString = Papa.unparse(dataToExport);
    const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = selectedListId
      ? `contacts_list_${selectedListId}.csv`
      : 'all_contacts.csv';
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Excel / CSV File Parsing Handler
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          mapAndSetImportRows(results.data);
        }
      });
    } else if (['xlsx', 'xls'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        mapAndSetImportRows(data);
      };
      reader.readAsBinaryString(file);
    } else {
      alert('Unsupported file format. Please upload .xlsx, .xls, or .csv');
    }
  };

  const mapAndSetImportRows = (rows) => {
    const mapped = rows
      .map((r) => {
        const keys = Object.keys(r);
        const phoneKey = keys.find((k) => /phone|mobile|number|tel|whatsapp/i.test(k)) || keys[0];
        const nameKey = keys.find((k) => /name|full|contact/i.test(k));
        const notesKey = keys.find((k) => /note|comment|remark|city|company/i.test(k));

        return {
          phone: String(r[phoneKey] || '').trim(),
          name: nameKey ? String(r[nameKey] || '').trim() : '',
          notes: notesKey ? String(r[notesKey] || '').trim() : '',
          raw: r
        };
      })
      .filter((r) => r.phone.length >= 7);

    setImportRows(mapped);
  };

  const handleExecuteImport = async () => {
    if (importRows.length === 0) return;
    setImportProgress('Processing and standardizing phone numbers...');
    try {
      const res = await api.importContacts(
        importRows,
        importTargetList || null,
        importNewListName || null
      );
      setImportProgress(`Successfully imported ${res.imported} contacts!`);
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportRows([]);
        setImportProgress(null);
        setImportNewListName('');
      }, 1500);
      await loadData();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
      setImportProgress(null);
    }
  };

  // Filter contacts by search query
  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.phone.toLowerCase().includes(q) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q)) ||
      (c.tags && c.tags.toLowerCase().includes(q)) ||
      (c.list_names && c.list_names.toLowerCase().includes(q))
    );
  });

  const selectedListObj = lists.find((l) => l.id === selectedListId);

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            Contacts & Audience Lists
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Organize audience lists, import CSV/Excel spreadsheets, and manage WhatsApp contacts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-800 transition"
            title="Download CSV of current contacts"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-800 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Import Excel / CSV</span>
          </button>
          <button
            onClick={() => {
              setListForm({ id: null, name: '', description: '' });
              setIsNewListModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-800 transition"
          >
            <FolderPlus className="w-4 h-4 text-blue-400" />
            <span>Create List</span>
          </button>
          <button
            onClick={() => {
              setContactForm({
                id: null,
                phone: '',
                name: '',
                notes: '',
                tags: '',
                list_ids: selectedListId ? [selectedListId] : []
              });
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/30 transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {/* Lists Horizontal Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
          <span>Filter by List:</span>
          {selectedListObj && (
            <span className="text-emerald-400">
              Active: {selectedListObj.name} ({contacts.length} members)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedListId(null)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              selectedListId === null
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>All Contacts</span>
          </button>

          {lists.map((list) => {
            const isSelected = selectedListId === list.id;
            return (
              <div
                key={list.id}
                onClick={() => setSelectedListId(list.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{list.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isSelected ? 'bg-emerald-800 text-emerald-200' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {list.member_count || 0}
                </span>

                <button
                  onClick={(e) => openEditList(list, e)}
                  className="hover:text-amber-300 p-0.5 ml-1 transition"
                  title="Edit list name"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => handleDeleteList(list.id, e)}
                  className="hover:text-rose-400 p-0.5 transition"
                  title="Delete list"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Search and Table Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Search & Bulk Action Bar */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by phone, name, notes, tags or lists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-3">
            {selectedContactIds.size === 1 && (
              <button
                onClick={() => {
                  const singleId = Array.from(selectedContactIds)[0];
                  const found = contacts.find((c) => c.id === singleId);
                  if (found && onQuickDispatch) onQuickDispatch(found);
                }}
                className="flex items-center gap-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-md shadow-emerald-950/50"
              >
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <span>Quick Dispatch to Selected</span>
              </button>
            )}
            {selectedContactIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/50 text-rose-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedContactIds.size})</span>
              </button>
            )}
            <span className="text-xs text-slate-400 font-medium">
              Showing {filteredContacts.length} contacts
            </span>
          </div>
        </div>

        {/* Contacts Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredContacts.length > 0 && selectedContactIds.size === filteredContacts.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-700 text-emerald-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Phone Number</th>
                <th className="py-3 px-4">Contact Name</th>
                <th className="py-3 px-4">Assigned Lists</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4">Tags</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No contacts found. Click "Add Contact" or "Import Excel / CSV" to begin!
                  </td>
                </tr>
              ) : (
                filteredContacts.map((c) => {
                  const isChecked = selectedContactIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-800/40 transition ${
                        isChecked ? 'bg-emerald-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(c.id)}
                          className="rounded border-slate-700 text-emerald-600 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-emerald-400">
                        +{c.phone}
                      </td>
                      <td className="py-3 px-4 text-slate-200 font-medium">
                        {c.name || <span className="text-slate-500 italic">No name</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {c.list_names ? (
                          <div className="flex flex-wrap gap-1">
                            {c.list_names.split(',').map((lname, idx) => (
                              <span
                                key={idx}
                                className="bg-slate-800 border border-slate-700 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-medium"
                              >
                                {lname.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-600 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                        {c.notes || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {c.tags ? (
                          <div className="flex flex-wrap gap-1">
                            {c.tags.split(',').map((tag, idx) => (
                              <span
                                key={idx}
                                className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-medium"
                              >
                                {tag.trim()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onQuickDispatch && onQuickDispatch(c)}
                            className="p-1.5 hover:bg-emerald-950/70 text-emerald-400 hover:text-emerald-300 rounded-lg transition"
                            title={`Send direct WhatsApp message to ${c.name || c.phone}`}
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditContact(c)}
                            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition"
                            title="Edit contact"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteContact(c.id)}
                            className="p-1.5 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-lg transition"
                            title="Delete contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Contact Modal */}
      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
        }}
        title={contactForm.id ? 'Edit WhatsApp Contact' : 'Add Single Contact'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveContact} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              WhatsApp Phone Number (with Country Code)
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 7011847629 or +917011847629"
              value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Enter with or without +, 10-digit Indian numbers auto-prefix +91.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Contact Name
            </label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Assign to Lists
            </label>
            <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-950 border border-slate-800 rounded-xl p-2.5">
              {lists.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">No lists created yet.</p>
              ) : (
                lists.map((l) => {
                  const checked = contactForm.list_ids.includes(l.id);
                  return (
                    <label
                      key={l.id}
                      className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-900 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? contactForm.list_ids.filter((id) => id !== l.id)
                            : [...contactForm.list_ids, l.id];
                          setContactForm({ ...contactForm, list_ids: next });
                        }}
                        className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                      />
                      <span>{l.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Notes / Organization</label>
            <textarea
              rows={2}
              placeholder="e.g. Lead from website, VIP buyer..."
              value={contactForm.notes}
              onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Tags (Comma separated)</label>
            <input
              type="text"
              placeholder="e.g. vip, lead, customer"
              value={contactForm.tags}
              onChange={(e) => setContactForm({ ...contactForm, tags: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-emerald-600/30"
            >
              {contactForm.id ? 'Save Changes' : 'Create Contact'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create List Modal */}
      <Modal
        isOpen={isNewListModalOpen}
        onClose={() => setIsNewListModalOpen(false)}
        title="Create New Audience List"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateList} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">List Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Q1 Campaign Leads"
              value={listForm.name}
              onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Target segment description..."
              value={listForm.description}
              onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsNewListModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-emerald-600/30"
            >
              Create List
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit List Modal */}
      <Modal
        isOpen={isEditListModalOpen}
        onClose={() => setIsEditListModalOpen(false)}
        title="Edit Audience List"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUpdateList} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">List Name</label>
            <input
              type="text"
              required
              value={listForm.name}
              onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
            <textarea
              rows={2}
              value={listForm.description}
              onChange={(e) => setListForm({ ...listForm, description: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsEditListModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-emerald-600/30"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Excel / CSV Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Contacts from Excel or CSV"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/70 rounded-2xl p-6 text-center cursor-pointer bg-slate-950/50 transition">
            <FileSpreadsheet className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-200">
              Drag and drop your .xlsx, .xls, or .csv file here
            </p>
            <p className="text-xs text-slate-400 mt-1 mb-3">
              Automatically maps Phone, Name, and Notes columns
            </p>
            <label className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-4 py-2 rounded-xl cursor-pointer transition">
              <span>Browse File</span>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Import List Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Assign to Existing List:
              </label>
              <select
                value={importTargetList}
                onChange={(e) => {
                  setImportTargetList(e.target.value);
                  setImportNewListName('');
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- No specific list --</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Or Create New List for this Import:
              </label>
              <input
                type="text"
                placeholder="e.g. October Leads Batch"
                value={importNewListName}
                onChange={(e) => {
                  setImportNewListName(e.target.value);
                  setImportTargetList('');
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Preview Parsed Rows */}
          {importRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>Preview: {importRows.length} valid contacts parsed</span>
                <span className="text-emerald-400">Showing first 5 rows</span>
              </div>
              <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Phone</th>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {importRows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-emerald-400 font-mono">+{r.phone}</td>
                        <td className="py-2 px-3 text-slate-300">{r.name || '-'}</td>
                        <td className="py-2 px-3 text-slate-400 truncate max-w-xs">{r.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importProgress && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{importProgress}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setIsImportModalOpen(false);
                setImportRows([]);
                setImportProgress(null);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={importRows.length === 0 || importProgress !== null}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2 rounded-xl transition shadow-lg shadow-emerald-600/30"
            >
              Import {importRows.length} Contacts Now
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Contacts;
