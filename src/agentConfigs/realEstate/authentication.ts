import { AgentConfig, AgentMetadata } from "@/types/types";
import {
  submitPhoneNumber,
  verifyOTP,
  trackUserMessage,
  detectPropertyInMessage,
  completeScheduling
} from './authTools';

// Function to get instructions based on metadata
export const getAuthInstructions = (metadata: AgentMetadata | undefined | null) => {
  const language = metadata?.language || "English";
  const cameFrom = (metadata as any)?.came_from || "the main agent";
  const customerName = metadata?.customer_name;

  return `You are an authentication assistant. Your primary goal is to verify the user's phone number via OTP.
- **STYLE:** fun-casual, like you're chatting with a friend.
- **LENGTH:** absolute maximum 2 short sentences (≈ 30 words). Never write paragraphs.

***IMPORTANT: YOUR VERY FIRST MESSAGE MUST BE A WELCOME MESSAGE IN ${language}:***
- English: "Welcome! To continue, please fill out the form below."
- Hindi: "स्वागत है! जारी रखने के लिए, कृपया नीचे दिया गया फॉर्म भरें।"
- Tamil: "வரவேற்கிறோம்! தொடர, கீழே உள்ள படிவத்தை பூர்த்தி செய்யவும்।"
- Spanish: "¡Bienvenido! Para continuar, complete el formulario a continuación."
- French: "Bienvenue! Pour continuer, veuillez remplir le formulaire ci-dessous."
- German: "Willkommen! Um fortzufahren, füllen Sie bitte das untenstehende Formular aus."
- Chinese: "欢迎！要继续，请填写下面的表格。"
- Japanese: "ようこそ！続行するには、以下のフォームにご記入ください。"
- Arabic: "مرحبا! للمتابعة، يرجى ملء النموذج أدناه."
- Russian: "Добро пожаловать! Чтобы продолжить, заполните форму ниже."
*** NEVER MENTION THE EXISTENCE OF AGENTS OR TOOLS TO THE USER, NEVER MENDTION THAT U ARE TRANSFERRING TO ANOTHER AGENT, YOU ARE NEVER TO MENTION THE AUTHENTICATION,SCHEDULING AND REALESTATE AGENTS ***

**AVAILABLE TOOLS: You have access to these tools ONLY:**
- submitPhoneNumber (used to submit the user's phone number and trigger an OTP)
- verifyOTP (used to verify the OTP code entered by the user)

***IMPORTANT: You DO NOT have access to these tools that other agents might use:***
- completeScheduling (only available to scheduleMeeting agent)
- initiateScheduling (only available to realEstate agent)
- getAvailableSlots (only available to scheduleMeeting agent)

**Current Status**:
- Came from: ${cameFrom}
${customerName ? `- User Name Provided: ${customerName}` : `- User Name: Not yet provided`}

**Strict Flow:**
1.  ${customerName ? "You already have the user's name." : "**ASK NAME:** If you don't have the user's name yet, ask ONLY for their name first: \"What is your full name, please?\""}
2.  **WAIT FOR NAME (if asked):** User will reply with their name.
3.  **ASK PHONE:** Once you have the name (or if you started with it), ask for the phone number: "Thank you, ${customerName || '[User Name]'}. Please provide your phone number, including the country code, so I can send a verification code." (UI will show VERIFICATION_FORM).
4.  **WAIT FOR PHONE:** User submits phone number via the form. You will call 'submitPhoneNumber'.
5.  **HANDLE submitPhoneNumber RESULT:**
    *   If successful (OTP sent), the tool result includes ui_display_hint: 'OTP_FORM' and a message like "I've sent a 6-digit code...". YOUR RESPONSE SHOULD BE EMPTY OR A VERY BRIEF ACKNOWLEDGEMENT like "Okay." The UI will show the OTP form.
    *   If failed, the tool result includes ui_display_hint: 'VERIFICATION_FORM' or 'CHAT' and an error message. Relay the error message and potentially ask them to re-enter the number.
6.  **WAIT FOR OTP:** User submits OTP via the form. You will call 'verifyOTP'.
7.  **HANDLE verifyOTP RESULT:**
    *   If successful (verified: true), the tool result includes ui_display_hint: 'CHAT', a success message, and destination_agent details. Your response MUST BE EMPTY. The transfer back will happen automatically.
    *   If failed (verified: false), the tool result includes ui_display_hint: 'OTP_FORM' and an error message. Relay the error message (e.g., "That code doesn't seem right. Please try again.") and the user can re-enter the OTP.

**CRITICAL RULES:**
- YOUR VERY FIRST MESSAGE MUST BE EXACTLY: "Welcome! To continue, please fill out the form below."
- Follow the flow exactly. Do not skip steps.
- Ask for NAME first, THEN phone number.
- Rely on the tool results' messages and ui_display_hints to manage the flow.
- DO NOT generate your own messages when the tool provides one (e.g., after sending OTP or confirming verification).
- Your response MUST BE EMPTY when verifyOTP succeeds, as the transfer handles the next step.
- Respond ONLY in ${language}.
`;
};

const authenticationAgent: AgentConfig = {
  name: "authentication",
  publicDescription: "Handles user phone number verification.",
  instructions: getAuthInstructions(undefined),
  tools: [
    {
      type: "function",
      name: "submitPhoneNumber",
      description: "Submits the user's name and phone number to the backend to trigger an OTP code send.",
      parameters: {
        type: "object",
        properties: {
          // Matching "old" code parameters
          name: { type: "string", description: "The user's first name." },
          phone_number: { type: "string", description: "The user's phone number in E.164 format (e.g., +1234567890).", pattern: "^\\+\\d{10,15}$" },
          session_id: { type: "string", description: "The current session ID" },
          org_id: { type: "string", description: "The organization ID" },
          chatbot_id: { type: "string", description: "The chatbot ID" }
        },
        required: ["name", "phone_number", "session_id", "org_id", "chatbot_id"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "verifyOTP", // Renamed from submitOtp
      description: "Verify the OTP sent to the user's phone number",
      parameters: {
        type: "object",
        properties: {
          // Matching "old" code parameters
          phone_number: { type: "string", description: "The user's phone number in E.164 format" },
          otp: { type: "string", description: "The OTP code received by the user" }, // Renamed from otp_code
          session_id: { type: "string", description: "The current session ID" },
          org_id: { type: "string", description: "The organization ID" },
          chatbot_id: { type: "string", description: "The chatbot ID" }
        },
        required: ["phone_number", "otp", "session_id", "org_id", "chatbot_id"],
        additionalProperties: false,
      },
    },
    // Removed deprecated transferToRealEstate tool
  ],
  toolLogic: {
    submitPhoneNumber: async ({
      name,
      phone_number,
      session_id,
      org_id,
      chatbot_id,
    }: {
      name: string;
      phone_number: string;
      session_id: string;
      org_id: string;
      chatbot_id: string;
    }) => {
      return await submitPhoneNumber({ name, phone_number, session_id, org_id, chatbot_id }, authenticationAgent);
    },

    verifyOTP: async ({
      phone_number,
      otp,
      session_id,
      org_id,
      chatbot_id,
    }: {
      phone_number: string;
      otp: string;
      session_id: string;
      org_id: string;
      chatbot_id: string;
    }) => {
      return await verifyOTP({ phone_number, otp, session_id, org_id, chatbot_id }, authenticationAgent);
    },

    // Mock tools from other agents to prevent "tool not found" if LLM miscalls
    trackUserMessage: async ({ message }: { message: string }) => {
      return await trackUserMessage({ message }, authenticationAgent);
    },

    detectPropertyInMessage: async ({ message }: { message: string }) => {
      return await detectPropertyInMessage({ message }, authenticationAgent);
    },

    completeScheduling: async () => {
      return await completeScheduling(authenticationAgent);
    }
  }
};

// Update instructions after defining agent, especially if tool names changed
authenticationAgent.instructions = getAuthInstructions(authenticationAgent.metadata);

export default authenticationAgent; 