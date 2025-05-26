import { AgentConfig } from "@/types/types";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Use the Supabase function URL from the "old" working code
const supabaseFuncUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNC_URL || "https://dsakezvdiwmoobugchgu.supabase.co/functions/v1/phoneAuth";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const submitPhoneNumber = async (
  {
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
  },
  agent: AgentConfig
) => {
  console.log("=== AUTHENTICATION AGENT METADATA (submitPhoneNumber) ===");
  console.log(`Agent metadata:`, {
    stored_chatbot_id: agent.metadata?.chatbot_id || 'undefined',
    stored_org_id: agent.metadata?.org_id || 'undefined',
    stored_session_id: agent.metadata?.session_id || 'undefined',
    came_from: (agent.metadata as any)?.came_from || 'undefined'
  });
  console.log(`Received args:`, { name, phone_number, session_id, org_id, chatbot_id });

  if (!anonKey) {
    console.error("[submitPhoneNumber] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    return { error: "Server configuration error.", ui_display_hint: 'CHAT', message: "Server configuration error." };
  }
  if (!name || !name.trim()) {
    return { error: "Name is required.", ui_display_hint: 'VERIFICATION_FORM', message: "Please provide your name." };
  }
  if (!phone_number || !/^\+[1-9]\d{1,14}$/.test(phone_number)) {
      return { 
          error: "Invalid phone number format.", 
          ui_display_hint: 'VERIFICATION_FORM', 
          message: "Please enter a valid phone number including the country code (e.g., +14155552671)."
      };
  }

  // ID Validation logic from "old" code
  let final_org_id = org_id;
  if (!UUID_REGEX.test(org_id)) {
    if (agent.metadata?.org_id && UUID_REGEX.test(agent.metadata.org_id)) {
      final_org_id = agent.metadata.org_id;
    } else {
      return { error: "Invalid organization ID format", ui_display_hint: 'CHAT', message: "Internal error: Invalid organization ID." };
    }
  }
  let final_chatbot_id = chatbot_id;
  if (chatbot_id === "default" || !UUID_REGEX.test(chatbot_id) || chatbot_id === org_id) {
    if (agent.metadata?.chatbot_id && UUID_REGEX.test(agent.metadata.chatbot_id)) {
      final_chatbot_id = agent.metadata.chatbot_id;
    } else {
      final_chatbot_id = "00000000-0000-0000-0000-000000000000"; // Fallback, should be valid
    }
  }
  let final_session_id = session_id;
  const isValidUUID = UUID_REGEX.test(session_id) || /^[0-9a-f]{32}$/i.test(session_id);
  const isSimpleDummyId = session_id.startsWith('session_') || session_id.includes('123') || session_id.length < 16 || !session_id.match(/^[a-zA-Z0-9-_]+$/) || session_id === org_id || session_id === chatbot_id;
  if (!isValidUUID || isSimpleDummyId) {
    if (agent.metadata?.session_id && agent.metadata.session_id.length > 16) {
      final_session_id = agent.metadata.session_id;
    } else {
      final_session_id = Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
      if (agent.metadata) agent.metadata.session_id = final_session_id;
    }
  }
  // Ensure different IDs
  if (final_session_id === final_org_id || final_chatbot_id === final_org_id || final_session_id === final_chatbot_id) {
     // Simplified error, complex recovery might be too risky here
     console.error("[submitPhoneNumber] CRITICAL ERROR: Detected duplicate IDs.");
     return { error: "Internal ID conflict.", ui_display_hint: 'CHAT', message: "An internal error occurred. Please try again."};
  }
  
  console.log("[submitPhoneNumber] FINAL VALIDATED VALUES:", { final_session_id, final_org_id, final_chatbot_id, phone_number, name });

  const requestBody = {
    session_id: final_session_id,
    phone_number,
    org_id: final_org_id,
    name,
    platform: "WebChat",
    chat_mode: "voice", // Assuming voice, can be dynamic
    chatbot_id: final_chatbot_id,
  };

  try {
    console.log(`[submitPhoneNumber] Using phoneAuth URL: ${supabaseFuncUrl}`);
    const response = await fetch(supabaseFuncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    console.log("[submitPhoneNumber] PhoneAuth response:", data);

    if (response.ok && data.success !== false) { // data.success could be true or undefined if not explicitly set to false
        if (agent.metadata) {
            agent.metadata.customer_name = name; // Use 'name' as per old code
            agent.metadata.phone_number = phone_number;
            agent.metadata.chatbot_id = final_chatbot_id;
            agent.metadata.org_id = final_org_id;
            agent.metadata.session_id = final_session_id;
        }
        return {
            success: true,
            message: data.message || "I've sent a 6-digit verification code to your phone. Please enter it below.",
            ui_display_hint: 'OTP_FORM',
        };
    } else {
        const errorMsg = data.error || data.message || "Failed to send OTP.";
        return {
            success: false,
            error: errorMsg,
            ui_display_hint: 'VERIFICATION_FORM',
            message: `Error: ${errorMsg}`
        };
    }
  } catch (error: any) {
    console.error("[submitPhoneNumber] Exception:", error);
    return { error: `Exception: ${error.message}`, ui_display_hint: 'VERIFICATION_FORM', message: "An unexpected error occurred." };
  }
}; 