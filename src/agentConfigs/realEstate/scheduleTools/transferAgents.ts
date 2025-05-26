import { AgentConfig } from "@/types/types";

export const transferAgents = async (
  { destination_agent }: { destination_agent: string },
  agent: AgentConfig
) => {
  console.log(`[scheduleMeeting.transferAgents] BLOCKED direct transfer to ${destination_agent}`);
  console.log("[scheduleMeeting.transferAgents] FORCING getAvailableSlots to be called first instead");
  
  // Instead of transferring, return a reminder that getAvailableSlots must be called first
  return {
    success: false,
    error: "getAvailableSlots must be called first before any transfers",
    message: "Please select a date for your visit from the calendar below.",
    ui_display_hint: 'SCHEDULING_FORM'
  };
}; 