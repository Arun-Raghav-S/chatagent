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
  const propertyName = (metadata as any)?.property_name || metadata?.active_project || "the property";

  // Create greeting message based on language
  const greetingMessage = language === "English" ? 
    `Hello! I'm here to help you schedule a visit to ${propertyName}. Please select a date for your visit from the calendar below.` :
    language === "Hindi" ? 
    `नमस्ते! मैं ${propertyName} के लिए आपकी यात्रा को शेड्यूल करने में मदद करने के लिए यहाँ हूँ। कृपया नीचे कैलेंडर से अपनी यात्रा के लिए एक तारीख चुनें।` :
    language === "Tamil" ? 
    `வணக்கம்! ${propertyName}க்கான உங்கள் வருகையைத் திட்டமிட நான் இங்கே உள்ளேன். கீழே உள்ள நாட்காட்டியில் இருந்து உங்கள் வருகைக்கான தேதியைத் தேர்ந்தெடுக்கவும்।` :
    language === "Spanish" ? 
    `¡Hola! Estoy aquí para ayudarte a programar una visita a ${propertyName}. Selecciona una fecha para tu visita del calendario a continuación.` :
    language === "French" ? 
    `Bonjour! Je suis ici pour vous aider à programmer une visite à ${propertyName}. Veuillez sélectionner une date pour votre visite dans le calendrier ci-dessous.` :
    language === "German" ? 
    `Hallo! Ich bin hier, um Ihnen bei der Terminvereinbarung für einen Besuch in ${propertyName} zu helfen. Wählen Sie bitte ein Datum für Ihren Besuch aus dem Kalender unten.` :
    language === "Chinese" ? 
    `你好！我在这里帮助您安排对${propertyName}的访问。请从下面的日历中选择您访问的日期。` :
    language === "Japanese" ? 
    `こんにちは！${propertyName}への訪問をスケジュールするお手伝いをします。下のカレンダーから訪問日を選択してください。` :
    language === "Arabic" ? 
    `مرحبا! أنا هنا لمساعدتك في جدولة زيارة إلى ${propertyName}. يرجى اختيار تاريخ لزيارتك من التقويم أدناه.` :
    language === "Russian" ? 
    `Привет! Я здесь, чтобы помочь вам запланировать визит в ${propertyName}. Выберите дату вашего визита в календаре ниже.` :
    `Hello! I'm here to help you schedule a visit to ${propertyName}. Please select a date for your visit from the calendar below.`;

  // Create time selection message based on language  
  const timeSelectionMessage = language === "English" ? 
    `"Perfect choice! 🎉 Now let's pick the perfect time for your visit!"` :
    language === "Hindi" ? 
    `"बेहतरीन चुनाव! 🎉 अब आइए अपनी यात्रा के लिए सबसे अच्छा समय चुनते हैं!"` :
    language === "Tamil" ? 
    `"சிறந்த தேர்வு! 🎉 இப்போது உங்கள் வருகைக்கு சரியான நேரத்தை தேர்ந்தெடுப்போம்!"` :
    language === "Spanish" ? 
    `"¡Excelente elección! 🎉 ¡Ahora elijamos el momento perfecto para tu visita!"` :
    language === "French" ? 
    `"Excellent choix! 🎉 Maintenant, choisissons l'heure parfaite pour votre visite!"` :
    language === "German" ? 
    `"Perfekte Wahl! 🎉 Jetzt wählen wir die ideale Zeit für Ihren Besuch!"` :
    language === "Chinese" ? 
    `"完美的选择！🎉 现在让我们为您的参观选择完美的时间！"` :
    language === "Japanese" ? 
    `"素晴らしい選択です！🎉 今度は訪問に最適な時間を選びましょう！"` :
    language === "Arabic" ? 
    `"اختيار ممتاز! 🎉 الآن دعنا نختار الوقت المثالي لزيارتك!"` :
    language === "Russian" ? 
    `"Отличный выбор! 🎉 Теперь давайте выберем идеальное время для вашего визита!"` :
    `"Perfect choice! 🎉 Now let's pick the perfect time for your visit!"`;

  return `# SCHEDULING ASSISTANT

You are a friendly scheduling assistant helping users book property visits.

## YOUR ROLE:
- Help users select dates and times for property visits
- Handle the booking process after date/time selection
- Provide friendly responses in ${language}

## TOOLS YOU CAN USE:
- **scheduleVisit**: Call this when user has selected both date and time
- **requestAuthentication**: Call this if user needs verification

## PROCESS & RESPONSES:

### 1. INITIAL GREETING (when you first receive ANY message):
**Always respond with this greeting:** 
"${greetingMessage}"

### 2. DATE SELECTION RESPONSE:
**When user sends a message like "Selected Monday, June 3" or containing a selected date, respond with:**
${timeSelectionMessage}

### 3. TIME SELECTION & BOOKING:
**When user sends a message like "Selected Monday, June 3 at 4:00 PM" (contains both date and time):**
- Check if user is verified (use metadata.is_verified)
- **If verified**: Call scheduleVisit immediately 
- **If unverified**: Call requestAuthentication immediately
- **After scheduleVisit success**: Your job is complete - end turn immediately

## MESSAGE RECOGNITION PATTERNS:
- **Greeting triggers**: "Hello", "Hi", "I need help", "booking", "visit", "schedule"
- **Date selection**: "Selected [Day, Date]" or messages containing selected dates
- **Time selection**: "Selected [Day, Date] at [Time]" or messages containing both date and time

## CRITICAL RULES:
- Always respond in ${language}
- Always respond to user messages - never stay silent
- Keep responses short and friendly
- End turn immediately after successful booking
- Never call tools from other agents

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