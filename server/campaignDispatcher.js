import PQueue from 'p-queue';
import { campaignsDao, messagesDao } from './db.js';
import { standardizePhone } from './phoneUtils.js';

// Zero-width characters for invisible message hash randomization
const ZW_CHARS = ['\u200B', '\u200C', '\u200D', '\uFEFF'];

function addInvisibleHashJitter(text) {
    if (!text) return text;
    // Generate a random sequence of 2-5 invisible zero-width characters
    const count = Math.floor(Math.random() * 4) + 2;
    let jitter = '';
    for (let i = 0; i < count; i++) {
        jitter += ZW_CHARS[Math.floor(Math.random() * ZW_CHARS.length)];
    }
    return text + jitter;
}

export class CampaignDispatcher {
    constructor(engineHost, options = {}) {
        this.engineHost = engineHost;
        this.activeCampaigns = new Map(); // campaignId -> { queue, isPaused, isCancelled, ... }
        this.onProgress = options.onProgress || (() => {});
    }

    // Resolves Spintax format: "{Hello|Hi|Greetings} {Friend|Customer}"
    parseSpintax(text) {
        if (!text) return '';
        return text.replace(/\{([^{}]+)\}/g, (match, choices) => {
            const options = choices.split('|');
            return options[Math.floor(Math.random() * options.length)];
        });
    }

    // Replace template variables like {{name}}, {{phone}}, {{company}}
    replaceVariables(text, contact = {}) {
        if (!text) return '';
        let result = text;
        result = result.replace(/\{\{\s*name\s*\}\}/gi, contact.name || 'Friend');
        result = result.replace(/\{\{\s*phone\s*\}\}/gi, contact.phone || '');
        result = result.replace(/\{\{\s*notes\s*\}\}/gi, contact.notes || '');

        if (contact.custom_fields) {
            try {
                const fields = typeof contact.custom_fields === 'string'
                    ? JSON.parse(contact.custom_fields)
                    : contact.custom_fields;
                for (const [k, v] of Object.entries(fields)) {
                    const regex = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'gi');
                    result = result.replace(regex, v || '');
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
        return result;
    }

    getRandomDelay(minSec, maxSec) {
        const minMs = Math.max(1, minSec) * 1000;
        const maxMs = Math.max(minMs, maxSec * 1000);
        const baseDelay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        // Sub-second micro-jitter (0 to 950ms) to ensure non-quantized human dispatch intervals
        const microJitter = Math.floor(Math.random() * 950);
        return baseDelay + microJitter;
    }

    async sleepWithCheck(ms, state) {
        const step = 500;
        let elapsed = 0;
        while (elapsed < ms) {
            if (state.isCancelled) return false;
            while (state.isPaused) {
                await new Promise(r => setTimeout(r, 500));
                if (state.isCancelled) return false;
            }
            const waitTime = Math.min(step, ms - elapsed);
            await new Promise(r => setTimeout(r, waitTime));
            elapsed += waitTime;
        }
        return !state.isCancelled;
    }

    async startCampaign(campaignId) {
        const campaign = campaignsDao.getById(campaignId);
        if (!campaign) throw new Error('Campaign not found');

        if (this.activeCampaigns.has(campaignId)) {
            const state = this.activeCampaigns.get(campaignId);
            if (state.isPaused) {
                state.isPaused = false;
                campaignsDao.updateStatus(campaignId, 'running');
                state.queue.start();
                return { status: 'resumed' };
            }
            return { status: 'already_running' };
        }

        const queuedMessages = messagesDao.getQueuedForCampaign(campaignId);
        if (queuedMessages.length === 0) {
            campaignsDao.updateStatus(campaignId, 'completed');
            return { status: 'completed', message: 'No queued messages' };
        }

        campaignsDao.updateStatus(campaignId, 'running');

        const queue = new PQueue({ concurrency: 1 });
        const batchLimit = Math.max(1, campaign.batch_count !== undefined ? campaign.batch_count : 15);
        const cooldownBaseSec = Math.max(5, campaign.cooldown_seconds !== undefined ? campaign.cooldown_seconds : 40);
        const simulateTyping = campaign.simulate_typing !== 0;

        const state = {
            queue,
            isPaused: false,
            isCancelled: false,
            campaignId,
            sentInBatch: 0,
            remainingCount: queuedMessages.length
        };
        this.activeCampaigns.set(campaignId, state);

        for (let idx = 0; idx < queuedMessages.length; idx++) {
            const msg = queuedMessages[idx];
            queue.add(async () => {
                if (state.isCancelled) return;
                while (state.isPaused) {
                    await new Promise(r => setTimeout(r, 500));
                    if (state.isCancelled) return;
                }

                try {
                    // 1. Interpolate variables and parse Spintax
                    const parsedWithVars = this.replaceVariables(msg.message_text, {
                        name: msg.recipient_name,
                        phone: msg.recipient_phone
                    });
                    let finalBody = this.parseSpintax(parsedWithVars);

                    // 2. Anti-ban invisible hash jitter (defeats duplicate content fingerprinting)
                    finalBody = addInvisibleHashJitter(finalBody);

                    const recipient = standardizePhone(msg.recipient_phone);

                    // 3. Human typing presence mimicry
                    if (simulateTyping) {
                        const charTime = Math.floor(Math.random() * 25) + 35;
                        const typingDuration = Math.min(4800, Math.max(1500, finalBody.length * charTime + Math.floor(Math.random() * 600)));
                        
                        this.onProgress({
                            campaignId,
                            messageId: msg.id,
                            status: 'typing',
                            recipient: msg.recipient_phone,
                            typingDurationMs: typingDuration
                        });

                        await this.engineHost.simulateTyping(campaign.session_id || 'default', recipient, typingDuration);
                        
                        // Natural hesitation (350-750ms) before clicking dispatch
                        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 400) + 350));
                    }

                    if (state.isCancelled) return;

                    // 4. Dispatch via WhatsApp engine
                    const res = await this.engineHost.sendText(
                        campaign.session_id || 'default',
                        recipient,
                        finalBody,
                        msg.media_url || campaign.media_path
                    );

                    messagesDao.updateStatus(msg.id, 'sent', null, res?.key?.id || 'sim-id');
                    campaignsDao.incrementStats(campaignId, 1, 0);
                    state.sentInBatch++;
                    state.remainingCount--;

                    this.onProgress({
                        campaignId,
                        messageId: msg.id,
                        status: 'sent',
                        recipient: msg.recipient_phone,
                        sentInBatch: state.sentInBatch,
                        remaining: state.remainingCount
                    });
                } catch (err) {
                    console.error(`Failed to send message to ${msg.recipient_phone}:`, err.message);
                    messagesDao.updateStatus(msg.id, 'failed', err.message);
                    campaignsDao.incrementStats(campaignId, 0, 1);
                    state.remainingCount--;

                    this.onProgress({
                        campaignId,
                        messageId: msg.id,
                        status: 'failed',
                        recipient: msg.recipient_phone,
                        error: err.message,
                        remaining: state.remainingCount
                    });

                    // Backoff if socket rate-limited
                    if (err.message && (err.message.includes('rate-overlimit') || err.message.includes('429'))) {
                        console.warn(`[Anti-Ban] Rate limit encountered for campaign ${campaignId}. Backing off 45 seconds...`);
                        this.onProgress({
                            campaignId,
                            status: 'rate_limit_backoff',
                            backoffSeconds: 45
                        });
                        await this.sleepWithCheck(45000, state);
                    }
                }

                if (state.isCancelled) return;

                // 5. Batch Cooldown vs. Inter-message Delay Jitter
                const isLastMessage = idx === queuedMessages.length - 1 || state.remainingCount <= 0;
                if (!isLastMessage) {
                    if (batchLimit > 0 && state.sentInBatch >= batchLimit) {
                        // Batch limit reached -> trigger Cooldown Pause with randomized jitter (e.g. ±3 seconds)
                        const jitterCooldown = Math.floor(Math.random() * 7) - 3;
                        const actualCooldownSec = Math.max(10, cooldownBaseSec + jitterCooldown);
                        console.log(`[Anti-Ban] Campaign ${campaignId}: Batch of ${state.sentInBatch} reached. Cooling down for ${actualCooldownSec}s...`);

                        this.onProgress({
                            campaignId,
                            status: 'cooldown',
                            cooldownSeconds: actualCooldownSec,
                            batchCount: state.sentInBatch
                        });

                        await this.sleepWithCheck(actualCooldownSec * 1000, state);
                        state.sentInBatch = 0; // reset batch counter for next wave
                    } else {
                        // Normal randomized inter-message jitter
                        const delayMs = this.getRandomDelay(
                            campaign.delay_min_seconds || 5,
                            campaign.delay_max_seconds || 18
                        );
                        console.log(`[Anti-Ban] Campaign ${campaignId}: waiting ${Math.round(delayMs / 1000)}s randomized delay...`);
                        await this.sleepWithCheck(delayMs, state);
                    }
                }
            });
        }

        queue.onIdle().then(() => {
            if (!state.isCancelled) {
                campaignsDao.updateStatus(campaignId, 'completed');
            }
            this.activeCampaigns.delete(campaignId);
            this.onProgress({ campaignId, status: state.isCancelled ? 'cancelled' : 'completed' });
        });

        return { status: 'started', count: queuedMessages.length };
    }

    pauseCampaign(campaignId) {
        const state = this.activeCampaigns.get(campaignId);
        if (!state) return false;
        state.isPaused = true;
        state.queue.pause();
        campaignsDao.updateStatus(campaignId, 'paused');
        return true;
    }

    resumeCampaign(campaignId) {
        const state = this.activeCampaigns.get(campaignId);
        if (!state) return false;
        state.isPaused = false;
        state.queue.start();
        campaignsDao.updateStatus(campaignId, 'running');
        return true;
    }

    cancelCampaign(campaignId) {
        const state = this.activeCampaigns.get(campaignId);
        if (!state) return false;
        state.isCancelled = true;
        state.queue.clear();
        campaignsDao.updateStatus(campaignId, 'cancelled');
        this.activeCampaigns.delete(campaignId);
        return true;
    }

    cancelAll() {
        for (const [id, state] of this.activeCampaigns.entries()) {
            state.isCancelled = true;
            try { state.queue.clear(); } catch (_) {}
            try { campaignsDao.updateStatus(id, 'cancelled'); } catch (_) {}
        }
        this.activeCampaigns.clear();
    }

    async restartCampaign(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            this.cancelCampaign(campaignId);
        }
        messagesDao.resetForCampaign(campaignId, false);
        campaignsDao.resetStats(campaignId);
        return this.startCampaign(campaignId);
    }

    async retryFailed(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            this.cancelCampaign(campaignId);
        }
        messagesDao.resetForCampaign(campaignId, true);
        campaignsDao.updateStatus(campaignId, 'pending');
        return this.startCampaign(campaignId);
    }
}

