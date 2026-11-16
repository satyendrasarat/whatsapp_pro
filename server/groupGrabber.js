import { contactsDao, listsDao } from './db.js';

export async function fetchAllGroups(sock) {
    if (!sock) throw new Error('WhatsApp session is not connected');

    // Baileys groupFetchAllParticipating() returns dictionary of groupJid -> GroupMetadata
    const groupsMap = await sock.groupFetchAllParticipating();
    const list = [];

    for (const [jid, data] of Object.entries(groupsMap)) {
        list.push({
            id: jid,
            subject: data.subject || 'Unnamed Group',
            creation: data.creation,
            owner: data.owner,
            desc: data.desc?.toString() || '',
            size: data.participants?.length || 0,
            participants: data.participants || []
        });
    }

    return list.sort((a, b) => b.size - a.size);
}

export async function extractGroupMembers(sock, groupJid) {
    if (!sock) throw new Error('WhatsApp session is not connected');

    const metadata = await sock.groupMetadata(groupJid);
    const lidList = [];
    const memberResults = [];

    for (const participant of metadata.participants) {
        if (participant.id.endsWith('@s.whatsapp.net')) {
            memberResults.push({
                jid: participant.id,
                phone: participant.id.split('@')[0],
                isAdmin: !!participant.admin,
                adminRole: participant.admin || 'member'
            });
        } else if (participant.id.endsWith('@lid')) {
            lidList.push(participant.id);
        }
    }

    // Resolve LIDs using Signal Repository cache
    if (lidList.length > 0 && sock.signalRepository?.lidMapping) {
        try {
            const mappings = await sock.signalRepository.lidMapping.getPNsForLIDs(lidList).catch(() => []);
            for (const item of mappings) {
                if (item && item.pn) {
                    memberResults.push({
                        jid: `${item.pn.split('@')[0]}@s.whatsapp.net`,
                        phone: item.pn.split('@')[0],
                        isAdmin: false,
                        adminRole: 'member (resolved from LID)'
                    });
                }
            }
        } catch (e) {
            console.warn('LID mapping lookup warning:', e.message);
        }
    }

    // Also include remaining unresolved LIDs as raw entries so no member is lost
    const resolvedPhones = new Set(memberResults.map(m => m.phone));
    for (const lid of lidList) {
        const rawId = lid.split('@')[0];
        if (!resolvedPhones.has(rawId)) {
            memberResults.push({
                jid: lid,
                phone: rawId,
                isAdmin: false,
                adminRole: 'member (LID)'
            });
        }
    }

    return {
        groupJid,
        subject: metadata.subject,
        totalMembers: memberResults.length,
        members: memberResults
    };
}

export async function saveGroupMembersToList(members, listName = null, listId = null) {
    let targetListId = listId;

    if (!targetListId && listName) {
        const res = listsDao.create(listName, `Imported from WhatsApp Group on ${new Date().toLocaleDateString()}`);
        targetListId = res.lastInsertRowid;
    }

    if (!targetListId) {
        throw new Error('Target list ID or name required');
    }

    // Bulk upsert contacts
    const contactsToInsert = members.map(m => ({
        phone: m.phone.replace(/\D/g, ''),
        name: `Group Member ${m.phone.slice(-4)}`,
        notes: `Imported from group (${m.adminRole})`,
        tags: 'whatsapp_group'
    })).filter(c => c.phone.length >= 7);

    contactsDao.bulkUpsert(contactsToInsert);

    // Retrieve their database IDs to link them to the list
    const allContacts = contactsDao.getAll();
    const phoneMap = new Map(allContacts.map(c => [c.phone, c.id]));

    const contactIds = [];
    for (const c of contactsToInsert) {
        const id = phoneMap.get(c.phone);
        if (id) contactIds.push(id);
    }

    listsDao.bulkAddMembers(targetListId, contactIds);

    return {
        listId: targetListId,
        importedCount: contactIds.length
    };
}

