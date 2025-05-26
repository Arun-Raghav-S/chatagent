import { AgentConfig } from "@/types/types";

export const requestAuthentication = async (
  {}: {},
  agent: AgentConfig
) => {
  console.log("[scheduleMeeting.requestAuthentication] Transferring to authentication agent.");
  const metadata = agent.metadata;
  const propertyName = (metadata as any)?.property_name || metadata?.active_project || "the property";
  const property_id = (metadata as any)?.property_id_to_schedule || (metadata as any)?.lastReturnedPropertyId;
  
  // Using silentTransfer: true and null message to make the transfer seamless
  return {
    destination_agent: "authentication",
    silentTransfer: true,
    message: null,
    ui_display_hint: 'VERIFICATION_FORM',
    came_from: 'scheduling',
    property_id_to_schedule: property_id, // Preserve the property ID 
    property_name: propertyName, // Preserve the property name
    selectedDate: (metadata as any)?.selectedDate, // Preserve the selected date if available
    selectedTime: (metadata as any)?.selectedTime // Preserve the selected time if available
  };
}; 