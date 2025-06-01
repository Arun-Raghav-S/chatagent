import { AgentConfig } from "@/types/types";

export const completeScheduling = async (
  {}: {},
  agent: AgentConfig
) => {
  console.log("[scheduleMeeting.completeScheduling] Scheduling complete, transferring back to realEstate agent.");
  const metadata = agent.metadata as any; // Use 'as any' for easier access to custom fields
  
  // Ensure we have all the necessary booking details
  const bookingDetails = {
    customerName: metadata?.customer_name || "Customer",
    propertyName: metadata?.property_name || "Selected Property", 
    date: metadata?.selectedDate || "Date not specified",
    time: metadata?.selectedTime || "Time not specified",
    phoneNumber: metadata?.phone_number
  };
  
  console.log("[completeScheduling] Booking details for confirmation:", bookingDetails);
  
  return {
    destination_agent: "realEstate",
    silentTransfer: true,
    message: null, // No message from this agent - let realEstate agent handle the confirmation
    // Pass all necessary data for realEstateAgent to confirm and show booking UI
    customer_name: metadata?.customer_name,
    is_verified: metadata?.is_verified, // Should be true
    has_scheduled: metadata?.has_scheduled, // Should be true
    property_name: metadata?.property_name,
    property_id: metadata?.property_id_to_schedule, // Ensure this uses the correct field name
    selectedDate: metadata?.selectedDate,
    selectedTime: metadata?.selectedTime,
    phone_number: metadata?.phone_number,
    flow_context: 'from_full_scheduling', // Add the flag for realEstateAgent
    // Add booking details for the confirmation UI
    booking_details: bookingDetails,
    ui_display_hint: 'BOOKING_CONFIRMATION' // Tell the UI to show booking confirmation
  };
}; 