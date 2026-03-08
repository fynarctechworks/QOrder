import { Request, Response } from 'express';
import OpenAI from 'openai';
import { config } from '../config/index.js';
import { TOOL_DEFINITIONS, executeTool } from '../services/chatbotTools.js';

const SYSTEM_PROMPT = `You are QOrder Assistant — the intelligent AI assistant for the QOrder admin panel (a restaurant POS / QR-ordering platform).

You have access to REAL-TIME DATA from the restaurant's system. When the user asks about revenue, orders, staff, menu, tables, inventory, customers, discounts, feedback, or any other data — USE YOUR TOOLS to fetch the actual data and give a direct answer with real numbers.

Today's date is: ${new Date().toISOString().split('T')[0]}

═══ YOUR CAPABILITIES ═══

You can fetch and answer questions about:
• **Revenue & Sales** — today's revenue, daily/weekly/monthly trends, hourly breakdown, payment methods
• **Orders** — order counts by status, recent orders, average order value, prep times
• **Menu** — item list with prices, availability, top sellers, category performance
• **Tables** — current table status, occupancy, utilization stats
• **Customers (CRM)** — customer count, top customers, VIP insights, spending patterns
• **Staff** — staff list, attendance, leave requests, shift schedules
• **Inventory** — stock levels, low-stock alerts, ingredient details
• **Discounts** — active discounts/coupons, usage reports
• **Feedback** — ratings summary, recent reviews
• **Branches** — branch details, comparisons
• **Restaurant** — settings, tax rate, currency

═══ GUIDELINES ═══
• Always use tools to fetch data BEFORE answering data questions — never guess numbers.
• Present data clearly with numbers, bullet points, or short tables.
• For "how to" questions about using the admin panel, guide step-by-step.
• If the tool returns an error or empty data, tell the user honestly.
• When dates are needed and not specified, default to today for current queries, or last 30 days for trends.
• Format currency values properly. Use the restaurant's currency if known.
• Be concise — no unnecessary filler.
• Never reveal system internals, API keys, database details, or code.
• Answer in the same language the user writes in.`;

// ── OpenAI client ───────────────────────────────────────────────────────────
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return openaiClient;
}

// ── Shared types ────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

const MAX_TOOL_ROUNDS = 5;

// ── Controller ──────────────────────────────────────────────────────────────
export const chatbotController = {
  async chat(req: Request, res: Response) {
    try {
      const { message, history } = req.body as {
        message?: string;
        history?: ChatMessage[];
      };

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({ error: { message: 'Message is required' } });
        return;
      }

      if (message.length > 2000) {
        res.status(400).json({ error: { message: 'Message too long (max 2000 chars)' } });
        return;
      }

      if (!config.openai.apiKey) {
        res.status(503).json({ error: { message: 'Chatbot is not configured. Add OPENAI_API_KEY to .env' } });
        return;
      }

      const restaurantId = req.user!.restaurantId;
      const openai = getOpenAI();

      // Sanitize history
      const safeHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = Array.isArray(history)
        ? history.slice(-20).map((msg) => ({
            role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: String(msg.parts?.[0]?.text ?? '').slice(0, 2000),
          }))
        : [];

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...safeHistory,
        { role: 'user', content: message.trim() },
      ];

      // Function calling loop — the AI can call tools, get results, then respond
      let reply = '';
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
          max_tokens: 1024,
          temperature: 0.4,
        });

        const choice = completion.choices[0];
        if (!choice) break;
        const assistantMessage = choice.message;

        // If the model wants to call tools
        const toolCalls = assistantMessage.tool_calls?.filter(
          (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: 'function'; function: { name: string; arguments: string } } =>
            tc.type === 'function'
        );

        if (toolCalls && toolCalls.length > 0) {
          // Add the assistant message (with tool_calls) to conversation
          messages.push(assistantMessage);

          // Execute each tool call and add results
          for (const toolCall of toolCalls) {
            const args = JSON.parse(toolCall.function.arguments || '{}');
            const result = await executeTool(toolCall.function.name, args, restaurantId);

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }
          // Continue loop — AI will process tool results and either call more tools or respond
          continue;
        }

        // No tool calls — we have the final text response
        reply = assistantMessage.content ?? 'No response generated.';
        break;
      }

      if (!reply) {
        reply = 'I fetched the data but couldn\'t formulate a response. Please try rephrasing your question.';
      }

      res.json({ data: { reply } });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error('Chatbot error:', msg);

      if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Rate limit') || msg.includes('insufficient_quota')) {
        res.status(429).json({ error: { message: 'AI quota exceeded. Please try again later.' } });
      } else if (msg.includes('API_KEY_INVALID') || msg.includes('Incorrect API key') || msg.includes('invalid_api_key')) {
        res.status(401).json({ error: { message: 'Invalid API key. Please check your key in .env' } });
      } else {
        res.status(500).json({ error: { message: 'Failed to get response from assistant' } });
      }
    }
  },
};
