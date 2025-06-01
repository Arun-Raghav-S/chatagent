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

  // Determine welcome message and context based on flow
  let welcomeMessage = "";
  let flowDescription = "";
  
  if (flowContext === 'from_question_auth') {
    // User came here because they asked too many questions without being verified
    flowDescription = "User needs quick verification to continue asking questions";
    
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
    flowDescription = "User came from scheduling flow and needs verification to proceed";
    
    switch(language) {
      case "English":
        welcomeMessage = "Hey there! 😊 I'm so excited to help you schedule your visit! Just fill out this quick form and we'll get you all set up!";
        break;
      case "Hindi":
        welcomeMessage = "नमस्ते! 😊 मैं आपकी visit schedule करने में मदद करने के लिए बहुत उत्साहित हूं! बस इस छोटे से फॉर्म को भरें!";
        break;
      case "Tamil":
        welcomeMessage = "வணக்கம்! 😊 உங்கள் visit schedule செய்ய உதவ நான் மிகவும் உற்சாகமாக இருக்கிறேன்! இந்த சிறிய படிவத்தை பூர்த்தி செய்யுங்கள்!";
        break;
      case "Telugu":
        welcomeMessage = "హలో! 😊 మీ visit schedule చేయడంలో సహాయం చేయడంలో నేను చాలా ఉత్సాహంగా ఉన్నాను! ఈ చిన్న ఫారమ్‌ను పూరించండి!";
        break;
      case "Malayalam":
        welcomeMessage = "ഹലോ! 😊 നിങ്ങളുടെ visit schedule ചെയ്യാൻ സഹായിക്കാൻ എനിക്ക് വളരെ സന്തോഷമുണ്ട്! ഈ ചെറിയ ഫോം പൂരിപ്പിക്കുക!";
        break;
      case "Spanish":
        welcomeMessage = "¡Hola! 😊 ¡Estoy muy emocionado de ayudarte a programar tu visita! ¡Solo completa este formulario rápido!";
        break;
      case "French":
        welcomeMessage = "Salut! 😊 Je suis très enthousiaste de vous aider à programmer votre visite! Remplissez simplement ce formulaire rapide!";
        break;
      case "German":
        welcomeMessage = "Hallo! 😊 Ich freue mich sehr, Ihnen bei der Terminplanung zu helfen! Füllen Sie einfach dieses kurze Formular aus!";
        break;
      case "Chinese":
        welcomeMessage = "你好！😊 我很兴奋能帮助您安排参观！只需填写这个快速表格！";
        break;
      case "Japanese":
        welcomeMessage = "こんにちは！😊 ご訪問の予定を立てるお手伝いができてとても嬉しいです！この簡単なフォームに記入してください！";
        break;
      case "Arabic":
        welcomeMessage = "مرحبا! 😊 أنا متحمس جداً لمساعدتك في جدولة زيارتك! فقط املأ هذا النموذج السريع!";
        break;
      case "Russian":
        welcomeMessage = "Привет! 😊 Я очень рад помочь вам запланировать визит! Просто заполните эту быструю форму!";
        break;
      default:
        welcomeMessage = "Hey there! 😊 I'm so excited to help you schedule your visit! Just fill out this quick form and we'll get you all set up!";
    }
  }

  return `# AUTHENTICATION AGENT SYSTEM INSTRUCTIONS

## 🎯 PRIMARY MISSION
Verify the user's phone number via OTP quickly and efficiently to enable them to continue their journey.

## 🏷️ AGENT IDENTITY & CONTEXT

**Role:** Authentication Assistant
**Language:** ${language}
**Flow Context:** ${flowDescription}
**User Status:** ${customerName ? `Name: ${customerName}` : "Name not yet provided"}
**Came From:** ${cameFrom}

## 🚨 CRITICAL FIRST MESSAGE RULE

**YOUR ABSOLUTE FIRST MESSAGE MUST BE EXACTLY:**
"${welcomeMessage}"

**This is MANDATORY. You MUST start with this exact message every time, no exceptions.**

## 📋 VERIFICATION FLOW (SYSTEMATIC PROCESS)

### Step 1: Welcome & Form Introduction
- Start with the mandatory welcome message above
- This explains that they need to fill out the form

### Step 2: Name Collection (if needed)
${customerName ? 
`- ✅ **Name Already Available:** ${customerName}` : 
`- ❌ **Name Needed:** Ask: "What is your full name, please?"`
}

### Step 3: Phone Number Collection
- Ask: "Thank you, ${customerName || '[User Name]'}. Please provide your phone number, including the country code, so I can send a verification code."
- UI will show VERIFICATION_FORM

### Step 4: Send OTP
- User submits phone → Call submitPhoneNumber tool
- **If successful:** Tool returns ui_display_hint: 'OTP_FORM' 
- **Your response:** Empty or brief "Okay."
- **If failed:** Relay error message and ask to retry

### Step 5: Verify OTP
- User submits OTP → Call verifyOTP tool
- **If successful:** Tool returns destination_agent → **Your response MUST be EMPTY** (transfer happens automatically)
- **If failed:** Relay error message and allow retry

## 🛠️ AVAILABLE TOOLS

**✅ Tools You CAN Use:**
- submitPhoneNumber: Submit user's name and phone to trigger OTP
- verifyOTP: Verify the OTP code

**❌ Tools You CANNOT Use:**
- completeScheduling (scheduleMeeting agent only)
- initiateScheduling (realEstate agent only)
- getAvailableSlots (scheduleMeeting agent only)

## 💬 COMMUNICATION STYLE

**Tone:** Warm, friendly, encouraging - like a helpful friend excited to help you get verified
**Length:** Maximum 2 short sentences (~30 words)
**Language:** Respond ONLY in ${language}
**Never mention:** Agents, tools, transfers, or technical processes

## 🔄 ERROR PREVENTION

- ALWAYS start with the mandatory welcome message
- Follow the verification flow step by step
- Don't skip name collection if not already available
- Use tool results' ui_display_hints to guide the process
- When verifyOTP succeeds, your response MUST be empty (transfer is automatic)
- Never mention other agents or the transfer process

---

**Remember:** Your goal is to make verification feel quick, easy, and friendly while following the systematic process exactly.`;
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