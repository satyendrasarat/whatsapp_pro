import { contactsDao, listsDao, lidMappingsDao } from './db.js';

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
        // WhatsApp Baileys participant object structure:
        // - participant.jid: actual phone JID (e.g. 919876543210@s.whatsapp.net) when available
        // - participant.id: might be phone JID OR lid (e.g. 161078587699354@lid)
        // - participant.lid: the LID if available
        // - participant.phoneNumber: phone number string if present
        const phoneJid = (participant.jid && participant.jid.endsWith('@s.whatsapp.net'))
            ? participant.jid
            : (participant.id && participant.id.endsWith('@s.whatsapp.net')
                ? participant.id
                : (participant.phoneNumber ? `${participant.phoneNumber.replace(/\D/g, '')}@s.whatsapp.net` : null));

        const lid = (participant.lid && participant.lid.endsWith('@lid'))
            ? participant.lid
            : (participant.id && participant.id.endsWith('@lid') ? participant.id : null);

        if (phoneJid) {
            const rawPhone = phoneJid.split('@')[0].replace(/\D/g, '');
            memberResults.push({
                jid: phoneJid,
                phone: rawPhone,
                lid: lid || null,
                isAdmin: !!participant.admin,
                adminRole: participant.admin ? (participant.admin === 'superadmin' ? 'superadmin' : 'admin') : 'member'
            });

            // Automatically cache the LID to phone mapping in DB
            if (lid) {
                try {
                    lidMappingsDao.upsert(lid, phoneJid, rawPhone, null);
                } catch (_) {}
            }
        } else if (lid) {
            // Check if our database already has this LID mapped to a known phone number
            const existingMapping = lidMappingsDao.get(lid);
            if (existingMapping && existingMapping.phone_number) {
                memberResults.push({
                    jid: existingMapping.phone_jid || `${existingMapping.phone_number}@s.whatsapp.net`,
                    phone: existingMapping.phone_number,
                    lid: lid,
                    isAdmin: !!participant.admin,
                    adminRole: participant.admin ? 'admin' : 'member'
                });
            } else {
                lidList.push(lid);
            }
        }
    }

    // Resolve any remaining unmapped LIDs using Signal Repository cache if available
    if (lidList.length > 0 && sock.signalRepository?.lidMapping) {
        try {
            const mappings = await sock.signalRepository.lidMapping.getPNsForLIDs(lidList).catch(() => []);
            for (const item of mappings) {
                if (item && item.pn) {
                    const rawPhone = item.pn.split('@')[0].replace(/\D/g, '');
                    memberResults.push({
                        jid: `${rawPhone}@s.whatsapp.net`,
                        phone: rawPhone,
                        lid: item.lid || null,
                        isAdmin: false,
                        adminRole: 'member (resolved from LID)'
                    });
                    if (item.lid) {
                        try {
                            lidMappingsDao.upsert(item.lid, `${rawPhone}@s.whatsapp.net`, rawPhone, null);
                        } catch (_) {}
                    }
                }
            }
        } catch (e) {
            console.warn('LID mapping lookup warning:', e.message);
        }
    }

    // Only if a member's phone number is strictly hidden by WhatsApp privacy settings, retain LID
    const resolvedPhones = new Set(memberResults.map(m => m.phone));
    const resolvedLids = new Set(memberResults.map(m => m.lid).filter(Boolean));
    for (const lid of lidList) {
        if (!resolvedLids.has(lid)) {
            const rawId = lid.split('@')[0];
            if (!resolvedPhones.has(rawId)) {
                memberResults.push({
                    jid: lid,
                    phone: rawId,
                    lid: lid,
                    isAdmin: false,
                    adminRole: 'member (hidden phone/LID)'
                });
            }
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

