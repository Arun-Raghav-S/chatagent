import { TranscriptItem } from "@/types/types";

interface ShowPropertyBrochureParams {
  property_name?: string;
}

interface ShowPropertyBrochureResult {
  success: boolean;
  message: string;
  ui_display_hint: 'BROCHURE_VIEWER';
  brochure_data: {
    propertyName: string;
    brochureUrl: string;
  };
  error?: string;
}

export async function showPropertyBrochure(
  params: ShowPropertyBrochureParams,
  realEstateAgent: any,
  transcriptItems: TranscriptItem[]
): Promise<ShowPropertyBrochureResult> {
  try {
    console.log('[showPropertyBrochure] Called with params:', params);

    // Get the property name from params or try to detect from context
    let propertyName = params.property_name;
    
    if (!propertyName) {
      // Try to get from recent conversation context
      const recentMessages = transcriptItems
        .filter(item => item.type === 'MESSAGE' && item.role === 'user')
        .slice(-5); // Look at last 5 user messages
      
      // Look for property mentions in recent messages
      for (const message of recentMessages.reverse()) {
        const text = message.text?.toLowerCase() || '';
        // Simple property name detection - you can enhance this
        if (text.includes('brochure') || text.includes('property') || text.includes('share')) {
          // Extract potential property name (this is a simple implementation)
          const words = text.split(' ');
          const propertyIndex = words.findIndex(word => 
            word.includes('property') || word.includes('project') || word.includes('building')
          );
          if (propertyIndex > 0) {
            propertyName = words[propertyIndex - 1];
            break;
          }
        }
      }
    }

    // Try to get property data from the agent's metadata or database
    const agentMetadata = realEstateAgent?.metadata;
    let propertyData = null;

    // If we have an active project, use that
    if (agentMetadata?.active_project_id && !propertyName) {
      try {
        // Import and use getProjectDetails to get real property data
        const { getProjectDetails } = await import('./getProjectDetails');
        const result = await getProjectDetails(
          { project_id: agentMetadata.active_project_id }, 
          realEstateAgent, 
          transcriptItems
        );
        
        if (result.properties && result.properties.length > 0) {
          propertyData = result.properties[0];
          propertyName = propertyData.name;
        } else if (result.property_details) {
          propertyData = result.property_details;
          propertyName = propertyData.name;
        }
      } catch (error) {
        console.error('[showPropertyBrochure] Error fetching active project:', error);
      }
    }

    // If we have a property name but no data yet, try to fetch by name
    if (propertyName && !propertyData) {
      try {
        const { getProjectDetails } = await import('./getProjectDetails');
        const result = await getProjectDetails(
          { project_name: propertyName }, 
          realEstateAgent, 
          transcriptItems
        );
        
        if (result.properties && result.properties.length > 0) {
          propertyData = result.properties[0];
        } else if (result.property_details) {
          propertyData = result.property_details;
        }
      } catch (error) {
        console.error('[showPropertyBrochure] Error fetching property by name:', error);
      }
    }

    // If still no property name, try to use the active project name
    if (!propertyName && agentMetadata?.active_project) {
      propertyName = agentMetadata.active_project;
      
      // Try to fetch data for the active project
      try {
        const { getProjectDetails } = await import('./getProjectDetails');
        const result = await getProjectDetails(
          { project_name: propertyName }, 
          realEstateAgent, 
          transcriptItems
        );
        
        if (result.properties && result.properties.length > 0) {
          propertyData = result.properties[0];
        } else if (result.property_details) {
          propertyData = result.property_details;
        }
      } catch (error) {
        console.error('[showPropertyBrochure] Error fetching active project by name:', error);
      }
    }

    // Default to "Selected Property" if we can't determine the name
    if (!propertyName) {
      propertyName = "Selected Property";
    }

    // Extract brochure URL from the property data if available
    let brochureUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"; // Default test URL

    if (propertyData?.brochure) {
      brochureUrl = propertyData.brochure;
    }

    const responseData = {
      propertyName: propertyName,
      brochureUrl: brochureUrl
    };

    console.log('[showPropertyBrochure] Returning brochure data:', responseData);

    return {
      success: true,
      message: `You can check the brochure here.`,
      ui_display_hint: 'BROCHURE_VIEWER',
      brochure_data: responseData
    };

  } catch (error) {
    console.error('[showPropertyBrochure] Error:', error);
    return {
      success: false,
      message: "Sorry, I couldn't retrieve the brochure at the moment.",
      ui_display_hint: 'BROCHURE_VIEWER',
      brochure_data: {
        propertyName: params.property_name || "Property",
        brochureUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
} 