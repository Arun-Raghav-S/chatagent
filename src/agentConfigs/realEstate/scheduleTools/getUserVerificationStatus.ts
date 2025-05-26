import { AgentConfig } from "@/types/types";

export const getUserVerificationStatus = async (
  {}: {},
  agent: AgentConfig
) => {
  console.log("[scheduleMeeting.getUserVerificationStatus] Checking verification status");
  const metadata = agent.metadata;
  const isVerified = metadata?.is_verified === true;
  
  return {
    is_verified: isVerified,
    user_verification_status: isVerified ? "verified" : "unverified",
    message: isVerified ? 
      "The user is already verified." : 
      "The user is not verified. Please use requestAuthentication to transfer to the authentication agent.",
    ui_display_hint: 'SCHEDULING_FORM' // Maintain the current UI
  };
}; 