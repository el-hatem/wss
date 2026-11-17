import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
} from '@google/genai';

const PORT = Number(process.env.PORT) || 10000;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('لم يتم العثور على مفتاح GEMINI_API_KEY في إعدادات الخادم.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Root info
app.get('/', (_req, res) => {
  res.json({
    status: 'online',
    service: 'Smart Memory WebSocket & Voice Server',
    endpoints: {
      health: '/api/health',
      tts: 'POST /api/tts',
      liveWebSocket: 'wss://<host>/api/live',
    },
  });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Arabic educational TTS endpoint
app.post('/api/tts', async (req, res) => {
  try {
    const { itemName, categoryTitle } = req.body as {
      itemName?: string;
      categoryTitle?: string;
    };

    if (!itemName || typeof itemName !== 'string' || !itemName.trim()) {
      res.status(400).json({ error: 'اسم العنصر مطلوب لتوليد الصوت.' });
      return;
    }

    const ai = getAiClient();
    const cleanName = itemName.trim();

    const spokenText = categoryTitle
      ? `هذا ${cleanName}! رائع، إنه من ${categoryTitle}!`
      : `هذا ${cleanName}! رائع جداً، أحسنت!`;

    const ttsResp = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [{ text: spokenText }],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio =
      ttsResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      res.status(502).json({
        error: 'تعذر توليد الملف الصوتي من خدمة النطق الذكي.',
      });
      return;
    }

    res.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
      spokenText,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'حدث خطأ أثناء توليد الصوت.';
    const status =
      message.includes('API_KEY') || message.includes('PERMISSION_DENIED')
        ? 403
        : 500;
    res.status(status).json({ error: message });
  }
});

const server = http.createServer(app);

// Real-time Arabic voice conversation via Gemini Live API (gemini-3.8-live)
const wss = new WebSocketServer({ server, path: '/api/live' });

wss.on('connection', async (clientWs: WebSocket) => {
  console.log('[WebSocket] Client connected to /api/live');
  let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;

  try {
    const ai = getAiClient();
    session = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Zephyr' },
          },
        },
        systemInstruction:
          'أنت المعلم الذكي في تطبيق ذاكرة ذكية للأطفال من ٣ إلى ٩ سنوات. تحدث بالعربية الواضحة البسيطة وبأسلوب دافئ ومشجع وممتع للأطفال. أجب بجمل قصيرة ومفهومة، وساعد الطفل على التعرف على الحيوانات والفواكه والمواصلات والأشكال.',
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          if (clientWs.readyState !== clientWs.OPEN) return;
          const content = message.serverContent;

          if (content?.inputTranscription?.text) {
            clientWs.send(
              JSON.stringify({ inputTranscript: content.inputTranscription.text })
            );
          }
          if (content?.outputTranscription?.text) {
            clientWs.send(
              JSON.stringify({ outputTranscript: content.outputTranscription.text })
            );
          }
          for (const part of content?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
            }
          }
          if (content?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
          if (content?.turnComplete) {
            clientWs.send(JSON.stringify({ turnComplete: true }));
          }
        },
        onerror: (err) => {
          console.error('[Gemini Live Error]:', err);
          if (clientWs.readyState === clientWs.OPEN) {
            clientWs.send(
              JSON.stringify({
                error: err?.message || 'حدث خطأ في الاتصال الصوتي المباشر.',
              })
            );
          }
        },
      },
    });

    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify({ ready: true }));
    } else {
      session.close();
      session = null;
      return;
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'تعذر بدء جلسة المحادثة الصوتية.';
    console.error('[Session Error]:', msg);
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify({ error: msg }));
    }
    return;
  }

  clientWs.on('message', (raw) => {
    if (!session) return;
    try {
      const parsed = JSON.parse(raw.toString()) as {
        audio?: string;
        text?: string;
      };
      if (parsed.audio) {
        session.sendRealtimeInput({
          audio: {
            data: parsed.audio,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      } else if (parsed.text) {
        session.sendRealtimeInput({ text: parsed.text });
      }
    } catch {
      // Ignore malformed payloads
    }
  });

  clientWs.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    try {
      session?.close();
    } catch {
      // Ignore close errors
    }
    session = null;
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Smart Memory WebSocket server running on http://0.0.0.0:${PORT}`);
});
