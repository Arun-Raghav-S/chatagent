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
  const flowContext = (metadata as any)?.flow_context;

  // Determine welcome message based on flow context
  let welcomeMessage = "";
  let contextExplanation = "";
  
  if (flowContext === 'from_question_auth') {
    // User came here because they asked too many questions without being verified
    contextExplanation = "- **Flow Context:** User asked multiple questions and needs verification before proceeding";
    
    // Different welcome messages for this flow
    switch(language) {
      case "English":
        welcomeMessage = "Hey there! 😊 I need to verify you quickly so you can ask more questions. Please fill out this quick form!";
        break;
      case "Hindi":
        welcomeMessage = "नमस्ते! 😊 मुझे आपको जल्दी से verify करना होगा ताकि आप और सवाल पूछ सकें। कृपया इस छोटे से फॉर्म को भरें!";
        break;
      case "Tamil":
        welcomeMessage = "வணக்கம்! 😊 நீங்கள் மேலும் கேள்விகள் கேட்க நான் உங்களை விரைவாக verify செய்ய வேண்டும். தயவுசெய்து இந்த சிறிய படிவத்தை பூர்த்தி செய்யுங்கள்!";
        break;
      case "Telugu":
        welcomeMessage = "హలో! 😊 మీరు మరిన్ని ప్రశ్నలు అడగడానికి నేను మిమ్మల్ని త్వరగా verify చేయాలి। దయచేసి ఈ చిన్న ఫారమ్‌ను పూరించండి!";
        break;
      case "Malayalam":
        welcomeMessage = "ഹലോ! 😊 നിങ്ങൾക്ക് കൂടുതൽ ചോദ്യങ്ങൾ ചോദിക്കാൻ ഞാൻ നിങ്ങളെ വേഗത്തിൽ verify ചെയ്യേണ്ടതുണ്ട്। ദയവായി ഈ ചെറിയ ഫോം പൂരിപ്പിക്കുക!";
        break;
      case "Spanish":
        welcomeMessage = "¡Hola! 😊 Necesito verificarte rápidamente para que puedas hacer más preguntas. ¡Por favor completa este formulario rápido!";
        break;
      case "French":
        welcomeMessage = "Salut! 😊 Je dois vous vérifier rapidement pour que vous puissiez poser plus de questions. Veuillez remplir ce formulaire rapide!";
        break;
      case "German":
        welcomeMessage = "Hallo! 😊 Ich muss Sie schnell verifizieren, damit Sie weitere Fragen stellen können. Bitte füllen Sie dieses kurze Formular aus!";
        break;
      case "Chinese":
        welcomeMessage = "你好！😊 我需要快速验证您，这样您就可以问更多问题了。请填写这个快速表格！";
        break;
      case "Japanese":
        welcomeMessage = "こんにちは！😊 もっと質問していただけるよう、迅速に認証する必要があります。この簡単なフォームに記入してください！";
        break;
      case "Arabic":
        welcomeMessage = "مرحبا! 😊 أحتاج إلى التحقق منك بسرعة حتى تتمكن من طرح المزيد من الأسئلة. يرجى ملء هذا النموذج السريع!";
        break;
      case "Russian":
        welcomeMessage = "Привет! 😊 Мне нужно быстро вас верифицировать, чтобы вы могли задать больше вопросов. Пожалуйста, заполните эту быструю форму!";
        break;
      default:
        welcomeMessage = "Hey there! 😊 I need to verify you quickly so you can ask more questions. Please fill out this quick form!";
    }
  } else {
    // Original scheduling flow welcome messages
    contextExplanation = "- **Flow Context:** User came for property scheduling verification";
    
    switch(language) {
      case "English":
        welcomeMessage = "Hey there! 😊 I'm so excited to help you! Just fill out this quick form and we'll get you all set up!";
        break;
      case "Hindi":
        welcomeMessage = "नमस्ते! 😊 मैं आपकी मदद करने के लिए बहुत उत्साहित हूं! बस इस छोटे से फॉर्म को भरें और हम आपको तैयार कर देंगे!";
        break;
      case "Tamil":
        welcomeMessage = "வணக்கம்! 😊 உங்களுக்கு உதவ நான் மிகவும் உற்சாகமாக இருக்கிறேன்! இந்த சிறிய படிவத்தை பூர்த்தி செய்யுங்கள், நாங்கள் உங்களை தயார் செய்வோம்!";
        break;
      case "Telugu":
        welcomeMessage = "హలో! 😊 మీకు సహాయం చేయడంలో నేను చాలా ఉత్సాహంగా ఉన్నాను! ఈ చిన్న ఫారమ్‌ను పూరించండి మరియు మేము మిమ్మల్ని సిద్ధం చేస్తాము!";
        break;
      case "Malayalam":
        welcomeMessage = "ഹലോ! 😊 നിങ്ങളെ സഹായിക്കാൻ എനിക്ക് വളരെ സന്തോഷമുണ്ട്! ഈ ചെറിയ ഫോം പൂരിപ്പിക്കുക, ഞങ്ങൾ നിങ്ങളെ തയ്യാറാക്കാം!";
        break;
      case "Spanish":
        welcomeMessage = "¡Hola! 😊 ¡Estoy muy emocionado de ayudarte! ¡Solo completa este formulario rápido y te tendremos listo!";
        break;
      case "French":
        welcomeMessage = "Salut! 😊 Je suis très enthousiaste de vous aider! Remplissez simplement ce formulaire rapide et nous vous préparerons!";
        break;
      case "German":
        welcomeMessage = "Hallo! 😊 Ich freue mich sehr, Ihnen zu helfen! Füllen Sie einfach dieses kurze Formular aus und wir bereiten Sie vor!";
        break;
      case "Chinese":
        welcomeMessage = "你好！😊 我很兴奋能帮助您！只需填写这个快速表格，我们就会为您准备好一切！";
        break;
      case "Japanese":
        welcomeMessage = "こんにちは！😊 お手伝いできてとても嬉しいです！この簡単なフォームに記入していただければ、準備完了です！";
        break;
      case "Arabic":
        welcomeMessage = "مرحبا! 😊 أنا متحمس جداً لمساعدتك! فقط املأ هذا النموذج السريع وسنجهزك!";
        break;
      case "Russian":
        welcomeMessage = "Привет! 😊 Я очень рад помочь вам! Просто заполните эту быструю форму, и мы подготовим вас!";
        break;
      default:
        welcomeMessage = "Hey there! 😊 I'm so excited to help you! Just fill out this quick form and we'll get you all set up!";
    }
  }

  return `You are an authentication assistant. Your primary goal is to verify the user's phone number via OTP.
- **STYLE:** warm, friendly and encouraging - like a helpful friend who's genuinely excited to help you get verified! Use positive language that makes people feel comfortable and supported.
- **LENGTH:** absolute maximum 2 short sentences (≈ 30 words). Never write paragraphs.

***IMPORTANT: YOUR VERY FIRST MESSAGE MUST BE:***
"${welcomeMessage}"

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
${contextExplanation}
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
- YOUR VERY FIRST MESSAGE MUST BE THE WELCOME MESSAGE IN ${language} AS SPECIFIED ABOVE.
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