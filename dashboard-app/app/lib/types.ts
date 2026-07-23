// Contexto que o Chatwoot injeta no iframe do Dashboard App via postMessage.
// Ref: https://www.chatwoot.com/docs/product/others/dashboard-apps
export interface ChatwootAppContext {
  conversation: {
    id: number;
    inbox_id: number;
    account_id: number;
  };
  contact: {
    id: number;
    name: string;
    phone_number: string | null;
  };
  currentAgent: {
    id: number;
    name: string;
    email: string;
  };
}

export type ReminderStatus = 'pending' | 'sent' | 'canceled' | 'failed';

export interface ScheduledMessage {
  id: number;
  account_id: number;
  inbox_id: number;
  conversation_id: number;
  contact_id: number;
  contact_name: string | null;
  contact_phone: string | null;
  appointment_at: string;
  reminder_message: string;
  send_at: string;
  status: ReminderStatus;
  sent_at: string | null;
  failure_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateReminderInput {
  account_id: number;
  inbox_id: number;
  conversation_id: number;
  contact_id: number;
  contact_name: string | null;
  contact_phone: string | null;
  appointment_at: string;
  reminder_message: string;
  send_at: string;
  created_by: string | null;
}
