import { AgentConfig, AgentMetadata } from "@/types/types";

// Required Environment Variables: NEXT_PUBLIC_SCHEDULE_VISIT_FUNC_URL, NEXT_PUBLIC_SCHEDULE_VISIT_FUNC_KEY
const scheduleVisitFuncUrl = process.env.NEXT_PUBLIC_SCHEDULE_VISIT_FUNC_URL || "https://dsakezvdiwmoobugchgu.supabase.co/functions/v1/schedule-visit-whatsapp";
const scheduleVisitFuncKey = process.env.NEXT_PUBLIC_SCHEDULE_VISIT_FUNC_KEY; // Needs to be set!

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

  if (!scheduleVisitFuncKey) {
      console.error("[scheduleVisit] Missing NEXT_PUBLIC_SCHEDULE_VISIT_FUNC_KEY environment variable.");
      return { error: "Server configuration error prevents scheduling.", ui_display_hint: 'CHAT', message: "A server configuration error is preventing scheduling. Please contact support." };
  }

  try {
    const response = await fetch(scheduleVisitFuncUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${scheduleVisitFuncKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: customer_name, phoneNumber: phone_number, propertyId: property_id, visitDateTime: actualVisitDateTime, chatbotId: chatbot_id, sessionId: session_id })
    });
    const result = await response.json();

    if (!response.ok) {
      console.error("[scheduleVisit] Schedule API error:", result?.error || response.statusText);
      return { error: result?.error || "Failed to schedule the visit via the API.", ui_display_hint: 'SCHEDULING_FORM', message: `I couldn't confirm the booking: ${result?.error || "Please try again."}` };
    }

    console.log("[scheduleVisit] Schedule visit successful via API:", result);

    if (agent.metadata) {
        agent.metadata.has_scheduled = true;
        agent.metadata.customer_name = customer_name; // Ensure customer_name is in metadata
        agent.metadata.phone_number = phone_number; // Ensure phone_number is in metadata
        (agent.metadata as any).property_name = propertyName; // Ensure property_name
        (agent.metadata as any).selectedDate = (metadata as any)?.selectedDate || actualVisitDateTime.split(' at ')[0]; // Ensure date
        (agent.metadata as any).selectedTime = (metadata as any)?.selectedTime || actualVisitDateTime.split(' at ')[1]; // Ensure time
         (agent.metadata as any).property_id_to_schedule = property_id; // Ensure property_id
    }

    return { 
      booking_confirmed: true,
      // message: null, // No direct message, realEstateAgent will confirm
      // ui_display_hint: 'CHAT', // No specific UI hint, will go to completeScheduling next
      // All necessary data is now in scheduleMeetingAgent.metadata for completeScheduling to pick up
      // Ensure all required fields for the confirmation message are present in the metadata for completeScheduling
      customer_name: customer_name,
      property_name: propertyName,
      selectedDate: (metadata as any)?.selectedDate || actualVisitDateTime.split(' at ')[0],
      selectedTime: (metadata as any)?.selectedTime || actualVisitDateTime.split(' at ')[1],
      property_id: property_id,
      has_scheduled: true
    }; // Agent will call completeScheduling next as per instructions

  } catch (error: any) {
     console.error("[scheduleVisit] Exception calling schedule API:", error);
     return { error: `Failed to schedule visit due to an exception: ${error.message}`, ui_display_hint: 'SCHEDULING_FORM', message: "An unexpected error occurred while trying to book your visit. Please try again." };
  }
}; 