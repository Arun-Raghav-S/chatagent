import { AgentConfig } from "@/types/types";

export const getAvailableSlots = async (
  { property_id }: { property_id: string },
  agent: AgentConfig
) => {
  console.log(`[getAvailableSlots] Fetching slots for property ID: ${property_id || 'UNDEFINED - Using default'}`);
  
  // Add debugging for property ID
  const metadata = agent.metadata;
  console.log("[getAvailableSlots] DEBUG - metadata info:");
  console.log("  - property_id from param:", property_id);
  console.log("  - property_id_to_schedule from metadata:", (metadata as any)?.property_id_to_schedule);
  console.log("  - property_name from metadata:", (metadata as any)?.property_name);
  console.log("  - active_project from metadata:", metadata?.active_project);
  console.log("  - active_project_id from metadata:", (metadata as any)?.active_project_id);
  console.log("  - project_ids from metadata:", metadata?.project_ids);
  console.log("  - is_verified:", metadata?.is_verified);
  
  // Use property_id_to_schedule from metadata if property_id is missing
  let effectivePropertyId = property_id;
  if (!effectivePropertyId && (metadata as any)?.property_id_to_schedule) {
    effectivePropertyId = (metadata as any).property_id_to_schedule;
    console.log(`[getAvailableSlots] Using property_id_to_schedule from metadata: ${effectivePropertyId}`);
  }
  
  // Fallback to first project_id if still missing
  if (!effectivePropertyId && metadata?.project_ids && metadata.project_ids.length > 0) {
    effectivePropertyId = metadata.project_ids[0];
    console.log(`[getAvailableSlots] Falling back to first project_id: ${effectivePropertyId}`);
  }
  
  // --- Get property name from metadata if available ---
  let propertyName = "this property";
  
  // Priority order for property name:
  // 1. property_name from transfer context (most specific)
  // 2. active_project from real estate agent
  // 3. fallback to generic name
  if ((metadata as any)?.property_name) {
    propertyName = (metadata as any).property_name;
    console.log(`[getAvailableSlots] Using property_name from transfer context: ${propertyName}`);
  } else if (metadata?.active_project && metadata.active_project !== "N/A") {
    propertyName = metadata.active_project;
    console.log(`[getAvailableSlots] Using active_project: ${propertyName}`);
  } else {
    console.log(`[getAvailableSlots] Using fallback property name: ${propertyName}`);
  }
  
  const slots: Record<string, string[]> = {};
  const standardTimeSlots = ["11:00 AM", "4:00 PM"];
  if ((metadata as any)?.selectedDate) {
    slots[(metadata as any).selectedDate] = standardTimeSlots;
  }
  
  const isVerified = metadata?.is_verified === true;
  const userVerificationStatus = isVerified ? "verified" : "unverified";

  // Create greeting message based on language
  let agentMessage = `Hello! I'm here to help you schedule a visit to ${propertyName}. Please select a date for your visit from the calendar below.`; // Default English
  
  if (metadata?.language) {
    const greetings: Record<string, string> = {
      "English": `Hello! I'm here to help you schedule a visit to ${propertyName}. Please select a date for your visit from the calendar below.`,
      "Hindi": `नमस्ते! मैं ${propertyName} के लिए आपकी यात्रा को शेड्यूल करने में मदद करने के लिए यहाँ हूँ। कृपया नीचे कैलेंडर से अपनी यात्रा के लिए एक तारीख चुनें।`,
      "Tamil": `வணக்கம்! ${propertyName}க்கான உங்கள் வருகையைத் திட்டமிட நான் இங்கே உள்ளேன். கீழே உள்ள நாட்காட்டியில் இருந்து உங்கள் வருகைக்கான தேதியைத் தேர்ந்தெடுக்கவும்।`,
      "Spanish": `¡Hola! Estoy aquí para ayudarte a programar una visita a ${propertyName}. Selecciona una fecha para tu visita del calendario a continuación.`,
      "French": `Bonjour! Je suis ici pour vous aider à programmer une visite à ${propertyName}. Veuillez sélectionner une date pour votre visite dans le calendrier ci-dessous.`,
      "German": `Hallo! Ich bin hier, um Ihnen bei der Terminvereinbarung für einen Besuch in ${propertyName} zu helfen. Wählen Sie bitte ein Datum für Ihren Besuch aus dem Kalender unten.`,
      "Chinese": `你好！我在这里帮助您安排对${propertyName}的访问。请从下面的日历中选择您访问的日期。`,
      "Japanese": `こんにちは！${propertyName}への訪問をスケジュールするお手伝いをします。下のカレンダーから訪問日を選択してください。`,
      "Arabic": `مرحبا! أنا هنا لمساعدتك في جدولة زيارة إلى ${propertyName}. يرجى اختيار تاريخ لزيارتك من التقويم أدناه.`,
      "Russian": `Привет! Я здесь, чтобы помочь вам запланировать визит в ${propertyName}. Выберите дату вашего визита в календаре ниже.`
    };
    
    agentMessage = greetings[metadata.language] || greetings["English"];
  }

  console.log(`[getAvailableSlots] Returning result with property_name: "${propertyName}"`);
  
  return { 
    slots: slots,
    timeSlots: standardTimeSlots,
    property_id: effectivePropertyId,
    property_name: propertyName,
    user_verification_status: userVerificationStatus,
    ui_display_hint: 'SCHEDULING_FORM',
    message: agentMessage,
  };
}; 