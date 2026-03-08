import { apiClient } from './apiClient';

interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export const chatbotService = {
  async sendMessage(message: string, history: ChatMessage[]): Promise<string> {
    const data = await apiClient.post<{ reply: string }>('/chatbot/message', {
      message,
      history,
    });
    return data.reply;
  },
};
