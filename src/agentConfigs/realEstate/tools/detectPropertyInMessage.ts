import { AgentMetadata } from "@/types/types";

export const detectPropertyInMessage = async ({ message }: { message: string }, realEstateAgent: any) => {
    console.log(`[detectPropertyInMessage] Analyzing message: "${message}"`);
    
    const metadata = realEstateAgent.metadata as AgentMetadata; // Added type assertion

    // Skip processing for trigger messages to avoid unnecessary property detection
    if (message.startsWith('{Trigger msg:')) {
        console.log("[detectPropertyInMessage] Processing trigger message for property detection");
        
        // Extract property name from trigger message - be more flexible with the pattern
        // Match any trigger message that contains "this" followed by a property name
        const triggerPropertyRegex = /\{Trigger msg:.*?this\s+(.+?)(?:\s+in\s+brief|\s+\})/i;
        const match = message.match(triggerPropertyRegex);
        
        if (match && match[1]) {
            let propertyNameFromTrigger = match[1].trim();
            
            // Clean up common suffixes that might be captured
            propertyNameFromTrigger = propertyNameFromTrigger.replace(/(\s+in\s+brief|\s+and\s+then.*|\s+\}).*$/i, '').trim();
            
            console.log(`[detectPropertyInMessage] Property name extracted from trigger: "${propertyNameFromTrigger}"`);
            
            // Find the closest matching property name from available projects
            const project_names = metadata?.project_names || [];
            let matchedProperty = null;
            
            // First try exact match
            if (project_names.includes(propertyNameFromTrigger)) {
                matchedProperty = propertyNameFromTrigger;
            } else {
                // Try case-insensitive match
                matchedProperty = project_names.find(p => 
                    p.toLowerCase() === propertyNameFromTrigger.toLowerCase()
                );
                
                // If still no match, try partial match
                if (!matchedProperty) {
                    matchedProperty = project_names.find(p => 
                        p.toLowerCase().includes(propertyNameFromTrigger.toLowerCase()) ||
                        propertyNameFromTrigger.toLowerCase().includes(p.toLowerCase())
                    );
                }
            }

            if (matchedProperty) {
                console.log(`[detectPropertyInMessage] Matched property: "${matchedProperty}" from trigger`);
                return {
                    propertyDetected: true,
                    detectedProperty: matchedProperty,
                    shouldUpdateActiveProject: true, // Always update for trigger messages
                    isTriggerMessage: true
                };
            } else {
                console.log(`[detectPropertyInMessage] Property "${propertyNameFromTrigger}" not found in available projects:`, project_names);
            }
        }
        
        return { 
            propertyDetected: false, 
            isTriggerMessage: true 
        };
    }
    
    const project_names = metadata?.project_names || [];
    console.log(`[detectPropertyInMessage] Available properties:`, project_names);

    // ADDITION: Direct check for scheduling messages
    const scheduleRegex = /^Yes, I'd like to schedule a visit for (.+?)[.!]?$/i;
    const scheduleMatch = message.match(scheduleRegex);
    
    // NEW: Check for scheduling intent with property reference
    const schedulingWithPropertyRegexes = [
        /\b(schedule|book|arrange|set up|plan) .*?(visit|tour|viewing|showing) .*?for (\w+)/i,
        /\b(visit|tour|see|view) .*?(\w+) .*?in person/i,
        /\b(interested|want) to .*?(visit|tour|see|view) .*?(\w+)/i
    ];
    
    let propertyName = null;
    let isScheduleRequest = false;
    
    // Check explicit UI button format first
    if (scheduleMatch) {
        propertyName = scheduleMatch[1].trim();
        isScheduleRequest = true;
        console.log(`[detectPropertyInMessage] Detected UI button scheduling request for: "${propertyName}"`);
    }
    
    // If no explicit match, check if it's a natural language scheduling request with property mention
    if (!propertyName) {
        for (const regex of schedulingWithPropertyRegexes) {
            const match = message.match(regex);
            if (match && match[3]) {
                // Extract potential property name and verify against known properties
                const potentialName = match[3].trim();
                // Check if this substring appears in any known property name
                const matchedProperty = project_names.find(p => 
                    p.toLowerCase().includes(potentialName.toLowerCase()) || 
                    potentialName.toLowerCase().includes(p.toLowerCase().replace(/\s+/g, ''))
                );
                
                if (matchedProperty) {
                    propertyName = matchedProperty;
                    isScheduleRequest = true;
                    console.log(`[detectPropertyInMessage] Detected natural language scheduling for: "${propertyName}"`);
                    break;
                }
            }
        }
    }
    
    if (isScheduleRequest && propertyName) {
        // Find property ID if possible
        let propertyId = null;
        // Use type assertion to access these properties
        const metadataAny = metadata as any;
        if (metadataAny?.project_id_map && metadataAny.project_id_map[propertyName]) {
            propertyId = metadataAny.project_id_map[propertyName];
        } else if (metadataAny?.active_project_id && 
                  (propertyName.toLowerCase() === metadata?.active_project?.toLowerCase())) {
            propertyId = metadataAny.active_project_id;
        }
        
        // Return special flag for scheduling
        return {
            propertyDetected: true,
            detectedProperty: propertyName,
            shouldUpdateActiveProject: true,
            isScheduleRequest: true,
            schedulePropertyId: propertyId
        };
    }

    if (!project_names.length) {
      return { propertyDetected: false, message: "No properties available" };
    }

    // Continue with regular property detection
    const normalizedMessage = message.toLowerCase().trim();
    let detectedProperty: string | null = null;

    // Function to check for match (exact or spaceless)
    const isMatch = (prop: string, msg: string) => {
        const trimmedProp = prop.trim().toLowerCase();
        const propNoSpaces = trimmedProp.replace(/\s+/g, '');
        const msgNoSpaces = msg.replace(/\s+/g, '');
        // Check for whole word match (exact) or spaceless containment
        const regex = new RegExp(`\\b${trimmedProp.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`); // Escape special chars
        return regex.test(msg) || msgNoSpaces.includes(propNoSpaces);
    };

    // Check for matches
    for (const property of project_names) {
       if (isMatch(property, normalizedMessage)) {
          detectedProperty = property; // Use original casing
          console.log(`[detectPropertyInMessage] Match found for: "${property}"`);
          break;
       }
    }

    if (detectedProperty && metadata?.active_project !== detectedProperty) {
      console.log(`[detectPropertyInMessage] Detected property "${detectedProperty}" is different from active "${metadata?.active_project}".`);
      // Return detected property; updateActiveProject should be called next by LLM if needed
      return {
        propertyDetected: true,
        detectedProperty: detectedProperty,
        shouldUpdateActiveProject: true, // Hint to LLM to call updateActiveProject
      };
    } else if (detectedProperty) {
        console.log(`[detectPropertyInMessage] Detected property "${detectedProperty}" is already active.`);
        return { propertyDetected: true, detectedProperty: detectedProperty, shouldUpdateActiveProject: false };
    } else {
         console.log(`[detectPropertyInMessage] No specific property detected.`);
         return { propertyDetected: false };
    }
}; 