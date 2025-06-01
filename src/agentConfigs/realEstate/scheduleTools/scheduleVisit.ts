import { AgentConfig, AgentMetadata } from "@/types/types";

export const scheduleVisit = async (
  { visitDateTime, property_id: propertyIdFromArgs, customer_name: nameFromArgs, phone_number: phoneFromArgs }: { 
    visitDateTime: string; 
    property_id?: string; 
    customer_name?: string; 
    phone_number?: string 
  },
  agent: AgentConfig
) => {
  console.log(`[scheduleVisit] Attempting to schedule visit for: ${visitDateTime} at property ${propertyIdFromArgs}`);

  const metadata: AgentMetadata | undefined = agent.metadata;
  let propertyName = (metadata as any)?.property_name || metadata?.active_project || "the property";

  if (!metadata) {
       console.error("[scheduleVisit] Agent metadata is missing.");
       return { error: "Missing required agent information for scheduling.", ui_display_hint: 'CHAT', message: "I'm having trouble accessing necessary information to schedule." };
  }

  let actualVisitDateTime = visitDateTime;
  if (!actualVisitDateTime && (metadata as any)?.selectedDate && (metadata as any)?.selectedTime) {
    actualVisitDateTime = `${(metadata as any).selectedDate} at ${(metadata as any).selectedTime}`;
    console.log(`[scheduleVisit] Using date/time from metadata: ${actualVisitDateTime}`);
  }

  if (!actualVisitDateTime) {
    console.error("[scheduleVisit] No visit date/time provided.");
    return { error: "No date and time selected for the visit.", ui_display_hint: 'SCHEDULING_FORM', message: "Please select a date and time for your visit." };
  }

  let property_id = propertyIdFromArgs || (metadata as any)?.property_id_to_schedule;
  if (!property_id && (metadata as any)?.lastReturnedPropertyId) {
    property_id = (metadata as any).lastReturnedPropertyId;
    console.log(`[scheduleVisit] Using property ID from previous getAvailableSlots call: ${property_id}`);
  }
  if (!property_id && metadata?.project_ids && metadata.project_ids.length > 0) {
    property_id = metadata.project_ids[0];
    console.log(`[scheduleVisit] Falling back to first project_id: ${property_id}`);
  }

  if (!metadata.is_verified) {
       console.log("[scheduleVisit] User is not verified - automatically transferring to authentication agent");
       return {
         destination_agent: "authentication",
         silentTransfer: true,
         message: null,
         ui_display_hint: 'VERIFICATION_FORM',
         came_from: 'scheduling',
         property_id_to_schedule: property_id, 
         property_name: propertyName, 
         selectedDate: (metadata as any)?.selectedDate, 
         selectedTime: (metadata as any)?.selectedTime 
       };
  }

  const customer_name = nameFromArgs || metadata.customer_name;
  const phone_number = phoneFromArgs || metadata.phone_number;

  console.log("[scheduleVisit] Using details - Name:", customer_name, "Phone:", phone_number);

  if (!customer_name || !phone_number) {
    console.error("[scheduleVisit] Missing customer name or phone number AFTER verification flow.");
    return { error: "Missing required customer details even after verification.", ui_display_hint: 'CHAT', message: "It seems some of your details are missing. Could you please provide them again or contact support?" };
  }

  if (!property_id) {
      console.error("[scheduleVisit] Missing property ID (not in args or metadata). Cannot schedule.");
      return { error: "Cannot schedule visit without knowing the property.", ui_display_hint: 'CHAT', message: "I don't have a specific property to schedule for. Could you clarify which one you're interested in?" };
  }

  const { chatbot_id, session_id } = metadata;
  if (!chatbot_id || !session_id) {
    console.error("[scheduleVisit] Missing critical metadata:", { chatbot_id, session_id });
    return { error: "Missing required session information.", ui_display_hint: 'CHAT', message: "A session information error is preventing scheduling. Please try again." };
  }

  console.log("[scheduleVisit] All details verified, confirming booking locally");
      
  // Update agent metadata to mark scheduling as complete
  if (agent.metadata) {
      agent.metadata.has_scheduled = true;
      agent.metadata.customer_name = customer_name;
      agent.metadata.phone_number = phone_number;
      (agent.metadata as any).property_name = propertyName;
      (agent.metadata as any).selectedDate = (metadata as any)?.selectedDate || actualVisitDateTime.split(' at ')[0];
      (agent.metadata as any).selectedTime = (metadata as any)?.selectedTime || actualVisitDateTime.split(' at ')[1];
      (agent.metadata as any).property_id_to_schedule = property_id;
  }

  // Return successful booking with explicit instruction to call completeScheduling
  return { 
    booking_confirmed: true,
    customer_name: customer_name,
    property_name: propertyName,
    selectedDate: (metadata as any)?.selectedDate || actualVisitDateTime.split(' at ')[0],
    selectedTime: (metadata as any)?.selectedTime || actualVisitDateTime.split(' at ')[1],
    property_id: property_id,
    has_scheduled: true,
    message: "Visit scheduled successfully!",
    // CRITICAL: Add explicit instruction for the agent
    next_action: "MUST_CALL_COMPLETE_SCHEDULING",
    instruction_for_agent: "CRITICAL: You MUST immediately call completeScheduling() tool next. Do not provide any response text."
  };
}; 