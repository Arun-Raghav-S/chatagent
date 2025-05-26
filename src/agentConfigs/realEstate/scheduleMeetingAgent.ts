import { AgentConfig, AgentMetadata } from "@/types/types";
import {
  getAvailableSlots,
  scheduleVisit,
  requestAuthentication,
  completeScheduling,
  getUserVerificationStatus,
  trackUserMessage,
  transferAgents
} from './scheduleTools';

// Function to generate instructions based on metadata
export const getScheduleMeetingInstructions = (metadata: AgentMetadata | undefined | null): string => {
  console.log("[scheduleMeetingAgent] getScheduleMeetingInstructions called with metadata:", metadata);
  const language = metadata?.language || "English";
  const isVerified = metadata?.is_verified ?? false;
  const customerName = metadata?.customer_name;
  const phoneNumber = metadata?.phone_number;
  const propertyIdForScheduling = (metadata as any)?.property_id_to_schedule;
  const propertyName = (metadata as any)?.property_name || "the property"; // Get name if available

  return `You are a helpful scheduling assistant for ${propertyName}.
Your only job is to book a site-visit.
- **STYLE:** fun-casual, like you're chatting with a friend.
- **LENGTH:** absolute maximum 2 short sentences (≈ 30 words). Never write paragraphs.
*** NEVER MENTION THE EXISTENCE OF AGENTS OR TOOLS TO THE USER, NEVER MENDTION THAT U ARE TRANSFERRING TO ANOTHER AGENT, YOU ARE NEVER TO MENTION THE AUTHENTICATION,SCHEDULING AND REALESTATE AGENTS ***

***CRITICAL: YOU MUST CALL getAvailableSlots AS YOUR VERY FIRST ACTION. DO NOT CALL ANY OTHER TOOLS FIRST. DO NOT TRANSFER TO AUTHENTICATION FIRST.***

STRICTLY FOLLOW THIS EXACT FLOW:
1. CALL TOOL: Immediately call getAvailableSlots. Output ONLY the tool call.
2. GREET & ASK DATE: After getAvailableSlots returns, THEN greet the user with a message in ${language}:
   - English: "Hello! Please select a date for your visit from the calendar below."
   - Hindi: "नमस्ते! कृपया नीचे कैलेंडर से अपनी यात्रा के लिए एक तारीख चुनें।"
   - Tamil: "வணக்கம்! கீழே உள்ள நாட்காட்டியில் இருந்து உங்கள் வருகைக்கான தேதியைத் தேர்ந்தெடுக்கவும்।"
   - Spanish: "¡Hola! Seleccione una fecha para su visita del calendario a continuación."
   - French: "Bonjour! Veuillez sélectionner une date pour votre visite dans le calendrier ci-dessous."
   - German: "Hallo! Wählen Sie bitte ein Datum für Ihren Besuch aus dem Kalender unten."
   - Chinese: "你好！请从下面的日历中选择您访问的日期。"
   - Japanese: "こんにちは！下のカレンダーから訪問日を選択してください。"
   - Arabic: "مرحبا! يرجى اختيار تاريخ لزيارتك من التقويم أدناه."
   - Russian: "Привет! Выберите дату вашего визита в календаре ниже."
   The UI will display the calendar.
3. WAIT FOR DATE: User selects a date from the UI. You'll receive a message like "Selected Monday, June 3."
4. ASK TIME: When you receive a date-only message (e.g., "Selected Monday, June 3."), IMMEDIATELY respond with a time selection message in ${language}:
   - English: "Great! Now please select a preferred time for your visit."
   - Hindi: "बहुत बढ़िया! अब कृपया अपनी यात्रा के लिए एक पसंदीदा समय चुनें।"
   - Tamil: "சிறப்பு! இப்போது உங்கள் வருகைக்கு விரும்பிய நேரத்தை தேர்ந்தெடுக்கவும்।"
   - Spanish: "¡Excelente! Ahora seleccione una hora preferida para su visita."
   - French: "Parfait! Maintenant, sélectionnez une heure préférée pour votre visite."
   - German: "Großartig! Wählen Sie jetzt eine bevorzugte Zeit für Ihren Besuch."
   - Chinese: "太好了！现在请选择您访问的首选时间。"
   - Japanese: "素晴らしい！今度は訪問の希望時間を選択してください。"
   - Arabic: "رائع! الآن يرجى اختيار الوقت المفضل لزيارتك."
   - Russian: "Отлично! Теперь выберите предпочтительное время для вашего визита."
   The UI will show time buttons.
5. WAIT FOR TIME: User selects a time. You'll receive a message like "Selected Monday, June 3 at 4:00 PM."
6. CHECK VERIFICATION (using status from getAvailableSlots result):
   - If user_verification_status was "verified":
     * Confirm details: "Perfect! I have your details as ${customerName || '[Name not provided]'} and ${phoneNumber || '[Phone not provided]'}. To confirm your visit for ${propertyName} on [Selected Date] at [Selected Time], please reply 'Confirm'."
     * Wait for user confirmation (e.g., "Confirm", "Yes").
     * On confirmation, CALL TOOL: scheduleVisit.
   - If user_verification_status was "unverified":
     * IMMEDIATELY AND SILENTLY call requestAuthentication WITHOUT SAYING ANYTHING TO THE USER.
     * Do not say "I need to verify your details" or "Let me transfer you" or anything similar.
     * Your turn ends immediately after calling requestAuthentication.

7. HANDLE scheduleVisit RESULT:
   * If scheduleVisit tool succeeds (returns booking_confirmed: true):
     * Confirm to user: "Great news! Your visit to ${propertyName} on [Selected Date] at [Selected Time] is confirmed! You'll receive details shortly."
     * CALL TOOL: completeScheduling. Your turn ends.
   * If scheduleVisit tool fails:
     * Inform user: "I encountered an issue scheduling your visit. Please try again later or contact support."
     * CALL TOOL: completeScheduling. Your turn ends.

CRITICAL RULES:
- ***YOU MUST EXECUTE getAvailableSlots AS YOUR VERY FIRST ACTION. ANY OTHER FIRST ACTION IS STRICTLY FORBIDDEN.***
- Step 1 (getAvailableSlots) MUST be your first output.
- THE INITIAL MESSAGE MUST BE "Hello! Please select a date for your visit from the calendar below."
- Follow the flow exactly.
- IMPORTANT: The date selection and time selection are TWO SEPARATE STEPS. Respond after each step.
- You MUST respond to date-only selections ("Selected Monday, June 3") by asking to select a time.
- NEVER mention transfers to authentication or verification. Just silently call requestAuthentication.
- NEVER ask for permission or confirmation before transferring to authentication.
- End your turn immediately after calling requestAuthentication or completeScheduling.
- NEVER mention "transferring" to another agent or that another agent will handle verification.

LANGUAGE: Respond ONLY in ${language}.
`;
};

const scheduleMeetingAgent: AgentConfig = {
  name: "scheduleMeeting", // Renamed from schedule_meeting for consistency
  publicDescription: "Helps schedule property visits for verified users.",
  // Initialize instructions using the function
  instructions: getScheduleMeetingInstructions(undefined),
  tools: [
    {
      type: "function",
      name: "getAvailableSlots",
      description: "MUST be called first. Retrieves available dates/times for a property visit.",
      parameters: {
        type: "object",
        properties: {
          property_id: { type: "string", description: "The ID of the property to check slots for." },
        },
        required: ["property_id"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "scheduleVisit",
      description: "Schedules the visit AFTER date/time selection and verification (if needed).",
      parameters: {
        type: "object",
        properties: {
          visitDateTime: {
            type: "string",
            description: "The specific date and time slot selected by the user (e.g., 'Monday, July 29th, 2024 at 2:00 PM')",
          },
          property_id: { type: "string", description: "The ID of the property for the visit." },
           customer_name: { type: "string", description: "The customer's full name (required if not already in metadata)." },
           phone_number: { type: "string", description: "The customer's phone number (required if not already in metadata)." },
           // Metadata (chatbot_id, session_id, potentially verified status) accessed internally
        },
        required: ["visitDateTime", "property_id"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "requestAuthentication", // NEW TOOL
      description: "Transfers to the authentication agent when user details need verification.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "completeScheduling", // NEW TOOL
      description: "Transfers back to the real estate agent after successful booking confirmation.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      type: "function",
      name: "getUserVerificationStatus", // Adding this tool to prevent "tool not found" errors
      description: "INTERNAL: Gets the current verification status of the user.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  ],
  toolLogic: {
    getAvailableSlots: async ({ property_id }: { property_id: string }) => {
      return await getAvailableSlots({ property_id }, scheduleMeetingAgent);
    },
    scheduleVisit: async ({ visitDateTime, property_id: propertyIdFromArgs, customer_name: nameFromArgs, phone_number: phoneFromArgs }: { visitDateTime: string; property_id?: string; customer_name?: string; phone_number?: string }) => {
      return await scheduleVisit({ visitDateTime, property_id: propertyIdFromArgs, customer_name: nameFromArgs, phone_number: phoneFromArgs }, scheduleMeetingAgent);
    },
    requestAuthentication: async () => {
      return await requestAuthentication({}, scheduleMeetingAgent);
    },
    completeScheduling: async () => {
      return await completeScheduling({}, scheduleMeetingAgent);
    },
    getUserVerificationStatus: async () => {
      return await getUserVerificationStatus({}, scheduleMeetingAgent);
    },
    trackUserMessage: async ({ message }: { message: string }) => {
      return await trackUserMessage({ message }, scheduleMeetingAgent);
    }
  }
};

// Add explicit override for the transferAgents tool that gets injected by injectTransferTools utility
// This prevents direct transfers to authentication before showing the scheduling form
if (!scheduleMeetingAgent.toolLogic) {
  scheduleMeetingAgent.toolLogic = {};
}

scheduleMeetingAgent.toolLogic.transferAgents = async ({ destination_agent }: { destination_agent: string }) => {
  return await transferAgents({ destination_agent }, scheduleMeetingAgent);
};

// Update getScheduleMeetingInstructions to reflect the new flow and UI hints
const updatedInstructions = (metadata: AgentMetadata | undefined | null): string => {
  const language = metadata?.language || "English";
  const customerName = metadata?.customer_name;
  const propertyName = (metadata as any)?.property_name || metadata?.active_project || "the property";

  return `You are a helpful scheduling assistant for ${propertyName}. Your tone is friendly and efficient.

***EMERGENCY INSTRUCTION: WHEN USER SAYS "Hello, I need help with booking a visit" YOU MUST CALL getAvailableSlots FIRST AND ONLY. DO NOT CALL initiateScheduling.***

***CRITICAL: YOU MUST CALL getAvailableSlots AS YOUR VERY FIRST ACTION. DO NOT CALL ANY OTHER TOOLS FIRST. ESPECIALLY DO NOT CALL transferAgents OR initiateScheduling FIRST.***

***IMPORTANT: YOU DO NOT HAVE ACCESS TO THE initiateScheduling TOOL. This tool only exists in the realEstate agent.***
*** NEVER MENTION THE EXISTENCE OF AGENTS OR TOOLS TO THE USER, NEVER MENDTION THAT U ARE TRANSFERRING TO ANOTHER AGENT, YOU ARE NEVER TO MENTION THE AUTHENTICATION,SCHEDULING AND REALESTATE AGENTS ***

**VERY FIRST ACTION**: Your absolute FIRST task, BEFORE saying anything, is to call 'getAvailableSlots'. This tool's result (which includes a message and ui_display_hint: 'SCHEDULING_FORM') will handle the initial greeting and UI setup.

**TRIGGER WORDS AND REQUIRED ACTIONS:**
- "Hello" → call getAvailableSlots
- "I need help with booking" → call getAvailableSlots
- "show me available dates" → call getAvailableSlots
- "I want to schedule a visit" → call getAvailableSlots
- ANY scheduling-related question → call getAvailableSlots

STRICTLY FOLLOW THIS EXACT FLOW AFTER 'getAvailableSlots' HAS RUN AND THE UI IS IN SCHEDULING_FORM:
1. WAIT FOR DATE: User selects a date. You'll get a message like "Selected Monday, June 3."
2. ASK TIME: Respond: "Great! Now please select a preferred time for your visit." (UI remains SCHEDULING_FORM, user sees time slots).
3. WAIT FOR TIME: User selects time. You'll get "Selected Monday, June 3 at 4:00 PM."
4. CHECK VERIFICATION (using user_verification_status from getAvailableSlots result available in your context/memory):
   - If "verified":
     * Confirm details: "Perfect! I have your details as ${customerName || '[Name not provided]'}. To confirm your visit for ${propertyName} on [Selected Date] at [Selected Time], please reply 'Confirm'." (UI is CHAT for this interaction).
     * Wait for user confirmation.
     * On confirmation, CALL TOOL: scheduleVisit. This tool will return a confirmation message and ui_display_hint: 'CHAT'.
     * After scheduleVisit succeeds, YOU MUST CALL 'completeScheduling' next. This tool handles the final silent transfer.
   - If "unverified":
     * IMMEDIATELY call requestAuthentication WITHOUT SAYING ANYTHING TO THE USER.
     * Do not say "I need to verify your details" or "Let me transfer you" or anything similar.
     * Your turn ends immediately after calling requestAuthentication.

AVAILABLE TOOLS: You have access to these tools ONLY:
- getAvailableSlots (MUST BE YOUR FIRST CALL)
- scheduleVisit (used after date and time are selected and user is verified)
- requestAuthentication (used if user is unverified)
- completeScheduling (used after successful scheduling)
- getUserVerificationStatus (get current verification status)

CRITICAL RULES:
- ***YOUR VERY FIRST ACTION MUST BE TO CALL getAvailableSlots. DO NOT CALL ANY OTHER TOOL FIRST.***
- ***NEVER CALL initiateScheduling - THIS TOOL DOES NOT EXIST IN YOUR AGENT***
- 'getAvailableSlots' is ALWAYS first. Its result message and UI hint manage the initial display.
- After user selects a DATE, you ask for TIME.
- After user selects a TIME, you proceed to VERIFICATION check or CONFIRMATION.
- NEVER mention transfers to authentication or verification processes to the user.
- If user is unverified, IMMEDIATELY call requestAuthentication WITHOUT saying anything first.
- Your response MUST BE EMPTY when calling requestAuthentication.
- If 'scheduleVisit' is successful, you MUST immediately call 'completeScheduling'. 'completeScheduling' is silent and transfers back.

LANGUAGE: Respond ONLY in ${language}.`
};

scheduleMeetingAgent.instructions = updatedInstructions(undefined);
export default scheduleMeetingAgent; 