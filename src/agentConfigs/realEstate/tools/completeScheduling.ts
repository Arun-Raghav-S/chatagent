export const completeScheduling = async (realEstateAgent: any) => {
    console.log("🚨🚨🚨 [realEstateAgent.completeScheduling] TOOL CALLED - Handling post-verification scheduling confirmation");
    
    const metadata = realEstateAgent.metadata as any;
    
    // Log all relevant scheduling data for debugging
    console.log("[realEstateAgent.completeScheduling] Available scheduling data:", {
        selectedDate: metadata?.selectedDate,
        selectedTime: metadata?.selectedTime,
        customer_name: metadata?.customer_name,
        property_name: metadata?.property_name,
        property_id_to_schedule: metadata?.property_id_to_schedule,
        active_project: metadata?.active_project,
        active_project_id: metadata?.active_project_id,
        phone_number: metadata?.phone_number
    });
    
    // Get the scheduling data - it should be available from the transfer
    const selectedDate = metadata?.selectedDate;
    const selectedTime = metadata?.selectedTime;
    const customerName = metadata?.customer_name;
    const phoneNumber = metadata?.phone_number;
    
    // Get property info - prefer active_project, fallback to property_name
    let propertyName = metadata?.active_project || metadata?.property_name || "the property";
    let propertyId = metadata?.active_project_id || metadata?.property_id_to_schedule;
    
    console.log("[realEstateAgent.completeScheduling] Using data:", {
        propertyId,
        propertyName,
        customerName,
        selectedDate,
        selectedTime,
        phoneNumber
    });

    // Check if we have the required data
    if (!selectedDate || !selectedTime || !customerName) {
        console.error("[realEstateAgent.completeScheduling] Missing critical scheduling data!");
        return {
            success: false,
            message: "I apologize, but there seems to be an issue with the scheduling data. Please try booking again.",
            ui_display_hint: 'CHAT'
        };
    }

    // Mark as scheduled in agent metadata
    if (realEstateAgent.metadata) {
        realEstateAgent.metadata.has_scheduled = true;
        realEstateAgent.metadata.is_verified = true;
        // Clear flow context to prevent re-processing
        delete (realEstateAgent.metadata as any).flow_context;
        
        // CRITICAL: Clear scheduling data to prevent repeated calls
        // Keep the data for API calls but mark as completed
        (realEstateAgent.metadata as any).scheduling_completed = true;
        console.log("[realEstateAgent.completeScheduling] Marked has_scheduled=true and scheduling_completed=true");
    }

    // Make API calls to notify about the scheduled visit
    try {
        // Prepare data for whatsapp-notifier API
        const notifierData = {
            org_id: metadata.org_id || "",
            builder_name: metadata.org_name || "Property Developer",
            lead_name: customerName || "",
            phone: phoneNumber?.replace("+", "") || ""
        };
        
        console.log("[realEstateAgent.completeScheduling] Sending whatsapp notification with data:", notifierData);
        
        // First API call - whatsapp-notifier
        fetch("https://dsakezvdiwmoobugchgu.functions.supabase.co/whatsapp-notifier", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzYWtlenZkaXdtb29idWdjaGd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNTI5Mjc4NiwiZXhwIjoyMDQwODY4Nzg2fQ.CYPKYDqOuOtU7V9QhZ-U21C1fvuGZ-swUEm8beWc_X0'
            },
            body: JSON.stringify(notifierData)
        })
        .then(response => response.json())
        .then(data => {
            console.log("[realEstateAgent.completeScheduling] Whatsapp notifier API response:", data);
        })
        .catch(error => {
            console.error("[realEstateAgent.completeScheduling] Whatsapp notifier API error:", error);
        });
        
        // Prepare data for schedule-visit-whatsapp API
        const scheduleData = {
            customerName: customerName || "",
            phoneNumber: phoneNumber?.startsWith("+") ? phoneNumber.substring(1) : phoneNumber || "",
            propertyId: propertyId || "",
            visitDateTime: `${selectedDate}, ${selectedTime}`,
            chatbotId: metadata.chatbot_id || ""
        };
        
        console.log("[realEstateAgent.completeScheduling] Sending schedule visit notification with data:", scheduleData);
        
        // Second API call - schedule-visit-whatsapp
        fetch("https://dsakezvdiwmoobugchgu.supabase.co/functions/v1/schedule-visit-whatsapp", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzYWtlenZkaXdtb29idWdjaGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjUyOTI3ODYsImV4cCI6MjA0MDg2ODc4Nn0.11GJjOlgPf4RocdFjMnWGJpBqFVk1wmbW27OmV0YAzs'
            },
            body: JSON.stringify(scheduleData)
        })
        .then(response => response.json())
        .then(data => {
            console.log("[realEstateAgent.completeScheduling] Schedule visit API response:", data);
        })
        .catch(error => {
            console.error("[realEstateAgent.completeScheduling] Schedule visit API error:", error);
        });
    } catch (error) {
        console.error("[realEstateAgent.completeScheduling] Error making API calls:", error);
    }
    
    // Create confirmation message for the agent to say
    const confirmationMessage = `Great news, ${customerName}! Your visit to ${propertyName} has been scheduled for ${selectedDate} at ${selectedTime}. You'll receive all details shortly!`;
    
    // Return success with confirmation message and booking details
    return {
        success: true,
        message: confirmationMessage,
        ui_display_hint: 'BOOKING_CONFIRMATION',
        booking_details: {
            customerName: customerName,
            propertyName: propertyName,
            date: selectedDate,
            time: selectedTime,
            phoneNumber: phoneNumber
        }
    };
}; 