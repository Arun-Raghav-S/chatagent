import { AgentConfig } from "@/types/types";

export const trackUserMessage = async (
  { message }: { message: string },
  agent: AgentConfig
) => {
  console.log(`[scheduleMeeting.trackUserMessage] Received message (ignoring): "${message}". This agent primarily acts on UI selections or specific function calls.`);
  // This tool should not produce a user-facing message or change UI on its own for this agent.
  // It's a no-op to prevent errors from misdirected simulated messages.
  return {
    success: true,
    acknowledged_by_scheduler: true,
    message_processed: false, // Explicitly indicate no standard processing occurred
    ui_display_hint: 'SCHEDULING_FORM' // Maintain the current UI
  };
}; 