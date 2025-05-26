import { AgentConfig } from "@/types/types";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Use the Supabase function URL from the "old" working code
const supabaseFuncUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNC_URL || "https://dsakezvdiwmoobugchgu.supabase.co/functions/v1/phoneAuth";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const verifyOTP = async (
  {
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
  },
  agent: AgentConfig
) => {
  console.log("=== AUTHENTICATION AGENT METADATA (verifyOTP) ===");
  console.log(`Agent metadata:`, {
      stored_chatbot_id: agent.metadata?.chatbot_id || 'undefined',
      stored_org_id: agent.metadata?.org_id || 'undefined',
      stored_session_id: agent.metadata?.session_id || 'undefined',
      came_from: (agent.metadata as any)?.came_from || 'undefined',
      current_phone: agent.metadata?.phone_number || 'undefined',
      current_name: agent.metadata?.customer_name || 'undefined',
  });
  console.log(`Received args:`, { phone_number, otp, session_id, org_id, chatbot_id });

  if (!anonKey) {
    console.error("[verifyOTP] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    return { error: "Server configuration error.", ui_display_hint: 'CHAT', message: "Server configuration error." };
  }
  if (!otp || !/^\d{6}$/.test(otp)) { // Check for 6 digits
       return { 
           verified: false, // Ensure verified flag is present on failure
           error: "Invalid OTP format.", 
           ui_display_hint: 'OTP_FORM', 
           message: "Please enter the 6-digit code."
       };
  }
   // Use the phone number from metadata if not explicitly passed or different
  const effective_phone_number = agent.metadata?.phone_number || phone_number;
  if (!effective_phone_number || !/^\+[1-9]\d{1,14}$/.test(effective_phone_number)) {
      return { 
          verified: false,
          error: "Invalid phone number for OTP verification.", 
          ui_display_hint: 'VERIFICATION_FORM', // Go back to phone form if number is bad
          message: "There's an issue with the phone number for verification. Please re-enter your phone number."
      };
  }

  // ID Validation logic from "old" code - crucial for correct backend interaction
  let final_org_id = org_id;
  if (!UUID_REGEX.test(org_id)) {
    if (agent.metadata?.org_id && UUID_REGEX.test(agent.metadata.org_id)) {
      final_org_id = agent.metadata.org_id;
    } else {
      return { verified: false, error: "Invalid organization ID format", ui_display_hint: 'CHAT', message: "Internal error: Invalid organization ID." };
    }
  }
  let final_chatbot_id = chatbot_id;
  if (chatbot_id === "default" || !UUID_REGEX.test(chatbot_id) || chatbot_id === org_id) {
    if (agent.metadata?.chatbot_id && UUID_REGEX.test(agent.metadata.chatbot_id)) {
      final_chatbot_id = agent.metadata.chatbot_id;
    } else {
      final_chatbot_id = "00000000-0000-0000-0000-000000000000"; // Fallback
    }
  }
  let final_session_id = session_id;
  const isValidUUID = UUID_REGEX.test(session_id) || /^[0-9a-f]{32}$/i.test(session_id);
  const isSimpleDummyId = session_id.startsWith('session_') || session_id.includes('123') || session_id.length < 16 || !session_id.match(/^[a-zA-Z0-9-_]+$/) || session_id === org_id || session_id === chatbot_id;

  if (!isValidUUID || isSimpleDummyId) {
    if (agent.metadata?.session_id && agent.metadata.session_id.length > 16) {
      final_session_id = agent.metadata.session_id;
    } else {
      // If submitPhoneNumber didn't run or failed to set a good session ID, we might have an issue.
      // For verifyOTP, we *must* use the session ID that submitPhoneNumber used.
      // If it's bad here, it means submitPhoneNumber likely failed or used a bad one.
      console.error("[verifyOTP] Potentially bad session_id and no good fallback from metadata. This OTP verification might fail.");
      // We proceed with the given session_id, but this is a warning sign.
    }
  }
    // Ensure different IDs
  if (final_session_id === final_org_id || final_chatbot_id === final_org_id || final_session_id === final_chatbot_id) {
     console.error("[verifyOTP] CRITICAL ERROR: Detected duplicate IDs.");
     return { verified: false, error: "Internal ID conflict.", ui_display_hint: 'CHAT', message: "An internal error occurred. Please try again."};
  }

  console.log("[verifyOTP] FINAL VALIDATED VALUES:", { final_session_id, final_org_id, final_chatbot_id, effective_phone_number, otp });

  const requestBody = {
    session_id: final_session_id,
    phone_number: effective_phone_number,
    org_id: final_org_id,
    otp,
    platform: "WebChat",
    chat_mode: "voice", // Assuming voice
    chatbot_id: final_chatbot_id,
  };

  try {
    console.log(`[verifyOTP] Using phoneAuth URL: ${supabaseFuncUrl}`);
    console.log("[verifyOTP] Sending OTP verification request:", requestBody); // Added log
    const response = await fetch(supabaseFuncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    console.log("[verifyOTP] Raw PhoneAuth VERIFY response status:", response.status, "ok:", response.ok); // Added log
    console.log("[verifyOTP] PhoneAuth response:", data);

    const isVerifiedByServer =
      (response.ok && data.success === true) ||
      (response.ok && data.verified === true) ||
      (response.ok && data.status === "success") ||
      (response.ok && data.success === "true") ||
      (response.ok && data.verified === "true") ||
      (response.ok && data.message && data.message.toLowerCase().includes("verif"));
    console.log("[verifyOTP] Server verification result (isVerifiedByServer):", isVerifiedByServer); // Added log

    if (isVerifiedByServer) {
      console.log("[verifyOTP] OTP verified successfully based on server response.");
      
      const cameFrom = (agent.metadata as any)?.came_from;
      const metadataAny = agent.metadata as any; // Cache for convenience

      let destinationAgentName: string;
      // Initialize transferData with common fields for successful verification
      let transferData: any = {
        is_verified: true,
        customer_name: metadataAny?.customer_name || "",
        phone_number: effective_phone_number,
        silentTransfer: true, // Default to silent for cleaner UX
        ui_display_hint: 'VERIFICATION_SUCCESS', // Custom hint for success message display
        verification_success_message: "Verification successful! You're now verified.", // Explicit success message
        message: "Verification successful! You're now verified.", // Also include in message field
      };

      if (cameFrom === 'scheduling') {
        destinationAgentName = 'realEstate'; // Transfer to realEstate for final confirmation
        transferData.flow_context = 'from_scheduling_verification'; // Changed from 'from_full_scheduling' to be more specific
        
        // Add all scheduling-related data needed by realEstateAgent for its confirmation message
        transferData.property_id_to_schedule = metadataAny?.property_id_to_schedule;
        transferData.property_name = metadataAny?.property_name;
        transferData.selectedDate = metadataAny?.selectedDate;
        transferData.selectedTime = metadataAny?.selectedTime;
        transferData.has_scheduled = true; // Mark as scheduled, verification was the last step
        
      } else { // Came from realEstateAgent directly for general auth or other flows
        destinationAgentName = 'realEstate';
        transferData.flow_context = 'from_direct_auth'; // Flag for realEstateAgent
        // is_verified, customer_name, phone_number are already in transferData
        // has_scheduled is not applicable or should remain as per existing metadata state (likely false/undefined)
      }
      
      console.log(`[verifyOTP] Preparing transfer to: ${destinationAgentName} with data:`, transferData);

      // IMPORTANT: Update agent's own metadata before returning transfer info
      if (agent.metadata) {
        agent.metadata.is_verified = true;
        if (cameFrom === 'scheduling') { // If scheduling flow, also mark as scheduled in auth agent's own state
            (agent.metadata as any).has_scheduled = true; 
        }
        // customer_name and phone_number should have been set by submitPhoneNumber or already exist
      }

      return {
        verified: true, // This is the primary result of verifyOTP tool itself
        destination_agent: destinationAgentName,
        ...transferData // Spread all other necessary fields for the transfer
      };
    } else {
      const errorMsg = data.error || data.message || "Invalid OTP or verification failed.";
      console.error("[verifyOTP] Verification failed:", errorMsg);
      return {
        verified: false,
        error: errorMsg,
        ui_display_hint: 'OTP_FORM', // Stay on OTP form
        message: `Verification failed: ${errorMsg}`
      };
    }
  } catch (error: any) {
    console.error("[verifyOTP] Exception:", error);
    return {
      verified: false,
      error: `Exception: ${error.message}`,
      ui_display_hint: 'OTP_FORM',
      message: "An unexpected error occurred during verification."
    };
  }
}; 