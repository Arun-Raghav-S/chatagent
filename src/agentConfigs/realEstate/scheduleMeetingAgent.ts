import { AgentConfig, AgentMetadata } from "@/types/types";
import {
  getAvailableSlots,
  scheduleVisit,
  requestAuthentication,
  getUserVerificationStatus,
  trackUserMessage,
  transferAgents
} from './scheduleTools';

// Function to generate instructions based on metadata
export const getScheduleMeetingInstructions = (metadata: AgentMetadata | undefined | null): string => {
  const language = metadata?.language || "English";
  const customerName = metadata?.customer_name;
  const propertyName = (metadata as any)?.property_name || metadata?.active_project || "the property";

  return `# SCHEDULING ASSISTANT

You help users schedule property visits. You are friendly and efficient.

## 🚨🚨🚨 ABSOLUTE FIRST RULE: CALL getAvailableSlots() ONLY 🚨🚨🚨

**YOU ARE THE SCHEDULING AGENT. YOUR ONLY JOB IS TO:**
1. **Call getAvailableSlots() first for ANY user message**
2. **Help users select dates and times**
3. **Call scheduleVisit() when ready to book**

**🚨 FORBIDDEN TOOLS - NEVER CALL THESE:**
- ❌ **initiateScheduling** (belongs to real estate agent)
- ❌ **detectPropertyInMessage** (belongs to real estate agent)
- ❌ **updateActiveProject** (belongs to real estate agent)

**✅ ALLOWED TOOLS - ONLY THESE:**
- ✅ **getAvailableSlots** (call this FIRST always)
- ✅ **scheduleVisit** (call after date/time selection)
- ✅ **requestAuthentication** (for unverified users)

## YOUR MANDATORY PROCESS:
1. **ANY user message** → **IMMEDIATELY call getAvailableSlots()**
2. **Use the exact message** the tool returns
3. **Wait for date selection**
4. **Ask for time selection** 
5. **Call scheduleVisit()** when both selected

## 🚨 CRITICAL RULE #2: scheduleVisit SUCCESS = END IMMEDIATELY 🚨
**When scheduleVisit returns success, your job is COMPLETE. End your turn immediately.**

LANGUAGE: Respond ONLY in ${language}.

## WHEN USER SELECTS DATE:
- User says: "Selected Monday, June 3"
- You respond: "Perfect choice! 🎉 Now let's pick the perfect time for your visit!"

## STEP 1: MANDATORY FIRST ACTION - ONLY getAvailableSlots()
- **🚨🚨🚨 CRITICAL: Your FIRST and ONLY action is getAvailableSlots() 🚨🚨🚨**
- **DO NOT call initiateScheduling - that's the wrong tool!**
- **DO NOT call any other tools first**
- **Call: getAvailableSlots() with NO parameters**
- **DO NOT respond with text until AFTER calling getAvailableSlots()**
- This tool returns slots and shows the calendar UI
- The tool provides your greeting message - use it exactly
- **If you call the wrong tool, the calendar will be broken**

## STEP 2: DATE SELECTION
- Wait for user to select a date from the UI
- You'll receive a message like "Selected Monday, June 3."
- Respond with time selection message in ${language}:
   - English: "Perfect choice! 🎉 Now let's pick the perfect time for your visit!"
   - Hindi: "बेहतरीन चुनाव! 🎉 अब आइए अपनी यात्रा के लिए सबसे अच्छा समय चुनते हैं!"
   - Tamil: "சிறந்த தேர்வு! 🎉 இப்போது உங்கள் வருகைக்கு சரியான நேரத்தை தேர்ந்தெடுப்போம்!"
   - Telugu: "అద్భుతమైన ఎంపిక! 🎉 ఇప్పుడు మీ సందర్శనకు సరైన సమయాన్ని ఎంచుకుందాం!"
   - Malayalam: "മികച്ച തിരഞ്ഞെടുപ്പ്! 🎉 ഇപ്പോൾ നിങ്ങളുടെ സന്ദർശനത്തിനുള്ള മികച്ച സമയം തിരഞ്ഞെടുക്കാം!"
   - Spanish: "¡Excelente elección! 🎉 ¡Ahora elijamos el momento perfecto para tu visita!"
   - French: "Excellent choix! 🎉 Maintenant, choisissons l'heure parfaite pour votre visite!"
   - German: "Perfekte Wahl! 🎉 Jetzt wählen wir die ideale Zeit für Ihren Besuch!"
   - Chinese: "完美的选择！🎉 现在让我们为您的参观选择完美的时间！"
   - Japanese: "素晴らしい選択です！🎉 今度は訪問に最適な時間を選びましょう！"
   - Arabic: "اختيار ممتاز! 🎉 الآن دعنا نختار الوقت المثالي لزيارتك!"
   - Russian: "Отличный выбор! 🎉 Теперь давайте выберем идеальное время для вашего визита!"

## STEP 3: TIME SELECTION  
- Wait for user to select a time from the UI
- You'll receive a message like "Selected Monday, June 3 at 4:00 PM."
- **IMMEDIATELY respond based on verification status stored from STEP 1:**

## STEP 4: VERIFICATION CHECK & BOOKING
**CRITICAL: Use the verification status stored in metadata from getAvailableSlots:**

### If user is VERIFIED (user_verification_status === "verified"):
**IMMEDIATELY after receiving time selection message (e.g., "Selected Monday, June 3 at 4:00 PM."):**
1. **IMMEDIATELY call scheduleVisit tool. DO NOT SAY ANYTHING TO THE USER. DO NOT ASK FOR CONFIRMATION.**

### 🚨🚨🚨 ABSOLUTELY CRITICAL AFTER scheduleVisit SUCCESS 🚨🚨🚨
**WHEN scheduleVisit RETURNS booking_confirmed: true:**
1. **🔥 YOUR JOB IS COMPLETE - scheduleVisit AUTOMATICALLY TRANSFERS TO MAIN AGENT 🔥**
2. **🔥 DO NOT CALL ANY OTHER TOOLS 🔥**
3. **🔥 DO NOT WRITE ANY RESPONSE TEXT 🔥**
4. **🔥 END YOUR TURN IMMEDIATELY 🔥**
5. **🔥 The main agent will handle all booking confirmation and UI updates 🔥**

### If user is UNVERIFIED:
1. **IMMEDIATELY call requestAuthentication WITHOUT saying anything**
2. **Your response MUST be completely empty when calling requestAuthentication**
3. **End your turn immediately**

## 🚨🚨🚨 CRITICAL SUCCESS FLOW - READ THIS 10 TIMES 🚨🚨🚨
When scheduleVisit succeeds (returns booking_confirmed: true):
1. **🔥🔥🔥 YOUR JOB IS DONE - scheduleVisit handles the transfer automatically 🔥🔥🔥** 
2. **🔥🔥🔥 Do NOT provide any response text 🔥🔥🔥**
3. **🔥🔥🔥 Your turn ends immediately 🔥🔥🔥**
4. **🔥🔥🔥 The main agent will automatically show booking confirmation 🔥🔥🔥**

**🚨 scheduleVisit SUCCESS = END TURN IMMEDIATELY = NO OTHER ACTIONS NEEDED 🚨**

## CRITICAL FAILURE FLOW:
When scheduleVisit fails:
1. Inform user: "I encountered an issue scheduling your visit. Please try again later or contact support."
2. **Your turn ends - the main agent will handle any follow-up**

## 🚨🚨🚨 ABSOLUTE RULES - MEMORIZE THESE 🚨🚨🚨
- ***🔥 FIRST ACTION: getAvailableSlots() - NO OTHER TOOL FIRST 🔥***
- ***❌ NEVER call initiateScheduling - WRONG AGENT TOOL***
- ***❌ NEVER call detectPropertyInMessage - WRONG AGENT TOOL***
- ***❌ NEVER call updateActiveProject - WRONG AGENT TOOL***
- ***✅ ONLY call: getAvailableSlots, scheduleVisit, requestAuthentication***
- ***🔥 AFTER scheduleVisit SUCCESS = END IMMEDIATELY 🔥***
- ***Never mention transfers, authentication, or other agents***

**🚨 REMEMBER: scheduleVisit success = end turn immediately = main agent takes over 🚨**

LANGUAGE: Respond ONLY in ${language}.`;
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
      description: "MUST be called first. Retrieves available dates/times for a property visit. Call with NO parameters - property ID will be taken from transfer context.",
      parameters: {
        type: "object",
        properties: {
          property_id: { type: "string", description: "Optional: The ID of the property to check slots for. If not provided, uses property from transfer context." },
        },
        required: [],
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
      name: "getUserVerificationStatus", // Adding this tool to prevent "tool not found" errors
      description: "INTERNAL: Gets the current verification status of the user.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  ],
  toolLogic: {
    getAvailableSlots: async ({ property_id }: { property_id?: string }) => {
      return await getAvailableSlots({ property_id: property_id || '' }, scheduleMeetingAgent);
    },
    scheduleVisit: async ({ visitDateTime, property_id: propertyIdFromArgs, customer_name: nameFromArgs, phone_number: phoneFromArgs }: { visitDateTime: string; property_id?: string; customer_name?: string; phone_number?: string }) => {
      return await scheduleVisit({ visitDateTime, property_id: propertyIdFromArgs, customer_name: nameFromArgs, phone_number: phoneFromArgs }, scheduleMeetingAgent);
    },
    requestAuthentication: async () => {
      return await requestAuthentication({}, scheduleMeetingAgent);
    },
    getUserVerificationStatus: async () => {
      return await getUserVerificationStatus({}, scheduleMeetingAgent);
    },
    trackUserMessage: async ({ message }: { message: string }) => {
      return await trackUserMessage({ message }, scheduleMeetingAgent);
    },
    
    // Safety check: Prevent scheduling agent from calling initiateScheduling
    initiateScheduling: async () => {
      console.error("[scheduleMeeting] ERROR: initiateScheduling should not be called by scheduling agent");
      return {
        error: "initiateScheduling is not available on scheduling agent",
        message: "I can only help with slot availability and visit scheduling. Let me fetch available dates for you.",
        ui_display_hint: "SCHEDULING_FORM"
      };
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

export default scheduleMeetingAgent; 