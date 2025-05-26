export const completeScheduling = async (realEstateAgent: any) => {
    console.log("🚨🚨🚨 [realEstateAgent.completeScheduling] TOOL CALLED - Handling post-verification scheduling confirmation");
    
    const metadata = realEstateAgent.metadata as any;
    
    // Log all relevant scheduling data for debugging
    console.log("[realEstateAgent.completeScheduling] Available scheduling data:", {
        selectedDate: metadata?.selectedDate,
        selectedTime: metadata?.selectedTime,
        appointment_date: metadata?.appointment_date, // Check for alternative field names
        appointment_time: metadata?.appointment_time,
        appointment_id: metadata?.appointment_id,
        customer_name: metadata?.customer_name,
        property_name: metadata?.property_name,
        property_id_to_schedule: metadata?.property_id_to_schedule,
        // CURRENT ACTIVE PROJECT INFO (should be used as primary source)
        active_project: metadata?.active_project,
        active_project_id: metadata?.active_project_id
    });
    
    // Get date and time - check both field name variations
    const dateToUse = metadata?.selectedDate || metadata?.appointment_date;
    const timeToUse = metadata?.selectedTime || metadata?.appointment_time;
    
    // PRIORITY: Use current active project for property info
    let propertyIdForApi = metadata?.active_project_id;
    let propertyNameForConfirmation = metadata?.active_project;
    
    // Fallback to property_id_to_schedule and property_name if active project not set
    if (!propertyIdForApi) {
        propertyIdForApi = metadata?.property_id_to_schedule;
        console.log("[realEstateAgent.completeScheduling] No active_project_id, falling back to property_id_to_schedule:", propertyIdForApi);
    }
    
    if (!propertyNameForConfirmation || propertyNameForConfirmation === "N/A") {
        propertyNameForConfirmation = metadata?.property_name;
        console.log("[realEstateAgent.completeScheduling] No active_project, falling back to property_name:", propertyNameForConfirmation);
    }
    
    // Final fallback
    propertyNameForConfirmation = propertyNameForConfirmation || "the property";
    
    console.log("[realEstateAgent.completeScheduling] FINAL VALUES FOR CONFIRMATION:", {
        propertyIdForApi,
        propertyNameForConfirmation,
        customer_name: metadata?.customer_name,
        dateToUse,
        timeToUse
    });
    
    // Check if we have scheduling data
    if ((dateToUse || timeToUse) && metadata?.customer_name) {
        console.log("[realEstateAgent.completeScheduling] Processing booking confirmation with data:", {
            customer_name: metadata.customer_name,
            property_name: propertyNameForConfirmation,
            property_id: propertyIdForApi,
            selectedDate: dateToUse,
            selectedTime: timeToUse,
            phone_number: metadata.phone_number
        });
        
        // Mark as scheduled in agent metadata
        if (realEstateAgent.metadata) {
            realEstateAgent.metadata.has_scheduled = true;
            realEstateAgent.metadata.is_verified = true;
            
            // Clear flow context to prevent re-processing
            delete (realEstateAgent.metadata as any).flow_context;
            // Store actual date and time in standard fields for consistency
            if (dateToUse && !metadata.selectedDate) {
                (realEstateAgent.metadata as any).selectedDate = dateToUse;
            }
            if (timeToUse && !metadata.selectedTime) {
                (realEstateAgent.metadata as any).selectedTime = timeToUse;
            }
        }
        
        // Make API calls to notify about the scheduled visit
        try {
            // Prepare data for whatsapp-notifier API
            const notifierData = {
                org_id: metadata.org_id || "",
                builder_name: metadata.org_name || "Property Developer",
                lead_name: metadata.customer_name || "",
                phone: metadata.phone_number?.replace("+", "") || ""
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
            
            // Prepare data for schedule-visit-whatsapp API - USE CORRECT PROPERTY ID
            const scheduleData = {
                customerName: metadata.customer_name || "",
                phoneNumber: metadata.phone_number?.startsWith("+") ? metadata.phone_number.substring(1) : metadata.phone_number || "",
                propertyId: propertyIdForApi || "", // Use the current active project ID
                visitDateTime: `${dateToUse}, ${timeToUse}`,
                chatbotId: metadata.chatbot_id || ""
            };
            
            console.log("[realEstateAgent.completeScheduling] Sending schedule visit notification with CORRECT property data:", scheduleData);
            
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
        
        // Create confirmation message for the agent to say - USE CORRECT PROPERTY NAME
        const confirmationMessage = `Great news, ${metadata.customer_name}! Your visit to ${propertyNameForConfirmation} has been scheduled for ${dateToUse} at ${timeToUse}. You'll receive all details shortly!`;
        
        // Return success with confirmation message
        return {
            success: true,
            message: confirmationMessage, // Agent will say this confirmation message
            ui_display_hint: 'BOOKING_CONFIRMATION', // New UI hint for the booking card
            booking_details: {
                customerName: metadata.customer_name,
                propertyName: propertyNameForConfirmation, // Use correct property name
                date: dateToUse,
                time: timeToUse,
                phoneNumber: metadata.phone_number
            }
        };
    } else {
        // Handle missing data case - but still try to show booking confirmation UI
        console.warn("[realEstateAgent.completeScheduling] Some scheduling data missing, using fallback approach", {
            selectedDate: metadata?.selectedDate,
            appointment_date: metadata?.appointment_date,
            selectedTime: metadata?.selectedTime,
            appointment_time: metadata?.appointment_time,
            customer_name: metadata?.customer_name,
            property_name: metadata?.property_name,
            active_project: metadata?.active_project
        });
        
        // Try to construct fallback booking details - USE ACTIVE PROJECT
        const fallbackBookingDetails = {
            customerName: metadata?.customer_name || "Valued Customer",
            propertyName: propertyNameForConfirmation,
            date: dateToUse || metadata?.selectedDate || "your selected date",
            time: timeToUse || metadata?.selectedTime || "your selected time",
            phoneNumber: metadata?.phone_number || ""
        };
        
        // Also clear scheduling specifics in the error/missing data case
        if (realEstateAgent.metadata) {
            delete (realEstateAgent.metadata as any).flow_context; // Ensure flow_context is cleared
            if (!dateToUse) (realEstateAgent.metadata as any).selectedDate = undefined;
            if (!timeToUse) (realEstateAgent.metadata as any).selectedTime = undefined;
        }
        
        console.log("[realEstateAgent.completeScheduling] Using fallback booking confirmation with:", fallbackBookingDetails);
        
        // Create fallback confirmation message
        const fallbackMessage = `Great news, ${fallbackBookingDetails.customerName}! Your visit to ${fallbackBookingDetails.propertyName} has been scheduled for ${fallbackBookingDetails.date} at ${fallbackBookingDetails.time}. You'll receive all details shortly!`;
        
        // Still try to show the booking confirmation UI even with partial data
        return {
            success: true,
            message: fallbackMessage, // Agent will say this confirmation message
            ui_display_hint: 'BOOKING_CONFIRMATION', // Show booking confirmation UI anyway
            booking_details: fallbackBookingDetails
        };
    }
}; 