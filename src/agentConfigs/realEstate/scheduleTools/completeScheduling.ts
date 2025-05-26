import { AgentConfig } from "@/types/types";

export const completeScheduling = async (
  {}: {},
  agent: AgentConfig
) => {
  console.log("[scheduleMeeting.completeScheduling] Scheduling complete, transferring back to realEstate agent.");
  const metadata = agent.metadata as any; // Use 'as any' for easier access to custom fields
  return {
    destination_agent: "realEstate",
    silentTransfer: true,
    message: null, // No message from this agent
    // Pass all necessary data for realEstateAgent to confirm
    customer_name: metadata?.customer_name,
    is_verified: metadata?.is_verified, // Should be true
    has_scheduled: metadata?.has_scheduled, // Should be true
    property_name: metadata?.property_name,
    property_id: metadata?.property_id_to_schedule, // Ensure this uses the correct field name
    selectedDate: metadata?.selectedDate,
    selectedTime: metadata?.selectedTime,
    flow_context: 'from_full_scheduling' // Add the flag for realEstateAgent
  };
}; 