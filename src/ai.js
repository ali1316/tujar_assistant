import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY || process.env.FREELLMAPI_API_KEY;
const isFreeLLM = apiKey?.startsWith('freellmapi-') || !!process.env.FREELLMAPI_BASE_URL;
const freeBaseUrl = (process.env.FREELLMAPI_BASE_URL || 'http://127.0.0.1:3001/v1').replace(/\/$/, '');

class FreeLLMAdapter {
  constructor(key, baseUrl) {
    this.key = key;
    this.baseUrl = baseUrl;
    this.models = {
      generateContent: async ({ model, contents, config } = {}) => {
        let promptText = '';
        if (typeof contents === 'string') {
          promptText = contents;
        } else if (Array.isArray(contents)) {
          promptText = contents
            .map(c => {
              if (typeof c === 'string') return c;
              if (c.parts) return c.parts.map(p => p.text || (p.inlineData ? '[مرفق مستند]' : '')).join('\n');
              if (c.text) return c.text;
              return JSON.stringify(c);
            })
            .join('\n');
        } else if (contents?.parts) {
          promptText = contents.parts.map(p => p.text || '').join('\n');
        } else {
          promptText = String(contents || '');
        }

        const messages = [];
        if (config?.systemInstruction) {
          messages.push({ role: 'system', content: String(config.systemInstruction) });
        }
        messages.push({ role: 'user', content: promptText });

        const body = {
          model: 'auto',
          messages,
          temperature: config?.temperature ?? 0.2,
        };
        if (config?.responseMimeType === 'application/json' || config?.responseJsonSchema) {
          body.response_format = { type: 'json_object' };
        }

        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`FreeLLMAPI error ${res.status}: ${errText}`);
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';
        return {
          text,
          output_text: text,
          candidates: [{ content: { parts: [{ text }] } }],
        };
      },
      embedContent: async () => {
        return { embeddings: null };
      },
    };

    this.interactions = {
      create: async ({ input, model } = {}) => {
        let prompt = '';
        if (typeof input === 'string') prompt = input;
        else if (Array.isArray(input)) prompt = input.map(i => i.text || '').filter(Boolean).join('\n');
        const res = await this.models.generateContent({ model, contents: prompt });
        return { output_text: res.text, text: res.text };
      },
    };
  }
}

export const ai = isFreeLLM
  ? new FreeLLMAdapter(apiKey, freeBaseUrl)
  : new GoogleGenAI({ apiKey });
