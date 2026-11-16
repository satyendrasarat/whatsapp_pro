import { settingsDao } from './db.js';

/**
 * Pure JavaScript PCM 16-bit to WAV buffer converter.
 * Wraps raw linear PCM (from Gemini TTS) with a standard 44-byte RIFF/WAVE header.
 */
export function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmBuffer.length;
    const chunkSize = 36 + dataSize;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(chunkSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
}

export class VoiceService {
    constructor() {}

    /**
     * Speech-to-Text (STT): Transcribe an incoming WhatsApp audio buffer into text.
     * Uses Google Gemini Multimodal Audio (gemini-3.5-flash-lite) or OpenAI Whisper.
     */
    async transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
        if (!audioBuffer || audioBuffer.length === 0) return '';
        const settings = settingsDao.getAll();

        // Normalize mimeType (strip codecs parameter for API compatibility)
        let normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
        if (!normalizedMime || normalizedMime === 'application/octet-stream') {
            normalizedMime = 'audio/ogg';
        }

        // 1. Try Gemini API
        if (settings.gemini_api_key) {
            const sttModels = [
                'gemini-3.5-flash-lite',
                'gemini-flash-latest',
                'gemini-2.5-flash-lite'
            ];

            const base64Data = audioBuffer.toString('base64');
            const prompt = 'Please transcribe the spoken audio verbatim in the language it was spoken. Do not add any preface, preamble, punctuation explanation, or translation unless asked. Output ONLY the exact transcribed text. If the audio is silent or unintelligible, reply with nothing.';

            for (const model of sttModels) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.gemini_api_key}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [
                                    { text: prompt },
                                    {
                                        inlineData: {
                                            mimeType: normalizedMime,
                                            data: base64Data
                                        }
                                    }
                                ]
                            }]
                        }),
                        signal: AbortSignal.timeout(12000)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text && text.trim()) {
                            console.log(`[Voice STT] Transcribed using Gemini (${model}): "${text.trim().slice(0, 60)}"`);
                            return text.trim();
                        }
                    } else {
                        const err = await response.json().catch(() => ({}));
                        console.warn(`[Voice STT] Gemini model ${model} HTTP ${response.status}:`, err.error?.message || response.statusText);
                    }
                } catch (err) {
                    console.warn(`[Voice STT] Gemini model ${model} error:`, err.message);
                }
            }
        }

        // 2. Try OpenAI Whisper (if configured)
        if (settings.openai_api_key) {
            try {
                const formData = new FormData();
                const blob = new Blob([audioBuffer], { type: normalizedMime });
                const ext = normalizedMime.includes('ogg') ? 'ogg' : normalizedMime.includes('mp4') ? 'm4a' : 'wav';
                formData.append('file', blob, `voice_note.${ext}`);
                formData.append('model', 'whisper-1');

                const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${settings.openai_api_key}`
                    },
                    body: formData,
                    signal: AbortSignal.timeout(12000)
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.text) {
                        console.log(`[Voice STT] Transcribed using OpenAI Whisper: "${data.text.trim().slice(0, 60)}"`);
                        return data.text.trim();
                    }
                }
            } catch (err) {
                console.warn('[Voice STT] OpenAI Whisper error:', err.message);
            }
        }

        return '';
    }

    /**
     * Text-to-Speech (TTS): Synthesize text response into a playable audio voice note buffer.
     * Uses Google Gemini TTS (gemini-2.5-flash-preview-tts) with fallback to OpenAI TTS.
     */
    async synthesizeSpeech(textToSpeak, options = {}) {
        if (!textToSpeak || !textToSpeak.trim()) return null;
        const settings = settingsDao.getAll();

        // Clean out markdown asterisks, URLs, and emojis for natural speech pronunciation
        const cleanText = textToSpeak
            .replace(/\*+/g, '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[•#_~`]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!cleanText) return null;

        // 1. Try Gemini TTS API
        if (settings.gemini_api_key) {
            const ttsModels = [
                'gemini-2.5-flash-preview-tts',
                'gemini-2.5-pro-preview-tts'
            ];

            const prompt = `Please read the following text aloud clearly, warmly, and naturally: ${cleanText}`;

            for (const model of ttsModels) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.gemini_api_key}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: {
                                responseModalities: ['AUDIO']
                            }
                        }),
                        signal: AbortSignal.timeout(15000)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const part = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
                        if (part?.data) {
                            const pcmBuffer = Buffer.from(part.data, 'base64');
                            // Extract sample rate from MIME type if present, default 24000
                            let sampleRate = 24000;
                            const rateMatch = part.mimeType?.match(/rate=(\d+)/);
                            if (rateMatch) {
                                sampleRate = parseInt(rateMatch[1], 10);
                            }

                            // Convert raw linear PCM to standard WAV format
                            const wavBuffer = pcmToWav(pcmBuffer, sampleRate, 1, 16);
                            console.log(`[Voice TTS] Generated speech audio with Gemini (${model}): ${wavBuffer.length} bytes (sample rate: ${sampleRate}Hz)`);
                            return {
                                audioBuffer: wavBuffer,
                                mimeType: 'audio/wav',
                                cleanText
                            };
                        }
                    } else {
                        const err = await response.json().catch(() => ({}));
                        console.warn(`[Voice TTS] Gemini model ${model} HTTP ${response.status}:`, err.error?.message || response.statusText);
                    }
                } catch (err) {
                    console.warn(`[Voice TTS] Gemini model ${model} error:`, err.message);
                }
            }
        }

        // 2. Try OpenAI TTS (if configured)
        if (settings.openai_api_key) {
            try {
                const response = await fetch('https://api.openai.com/v1/audio/speech', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.openai_api_key}`
                    },
                    body: JSON.stringify({
                        model: 'tts-1',
                        input: cleanText,
                        voice: options.voice || 'alloy'
                    }),
                    signal: AbortSignal.timeout(15000)
                });

                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    const mp3Buffer = Buffer.from(arrayBuffer);
                    console.log(`[Voice TTS] Generated speech audio with OpenAI: ${mp3Buffer.length} bytes`);
                    return {
                        audioBuffer: mp3Buffer,
                        mimeType: 'audio/mp4',
                        cleanText
                    };
                }
            } catch (err) {
                console.warn('[Voice TTS] OpenAI TTS error:', err.message);
            }
        }

        return null;
    }
}

export const voiceService = new VoiceService();
export default voiceService;
