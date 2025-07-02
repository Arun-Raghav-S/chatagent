import { TranscriptItem } from "@/types/types";
import { checkAuthenticationOnly } from './trackUserMessage';

interface RealEstateAgent {
  metadata?: {
    active_project_id?: string;
    project_ids?: string[];
    project_id_map?: Record<string, string>;
    project_names?: string[];
    active_project?: string;
  };
}

export const showPropertyBrochure = async ({ property_name }: { property_name?: string }, realEstateAgent: RealEstateAgent, transcript: TranscriptItem[] = []) => {
    console.log(`[showPropertyBrochure] Showing brochure for property: ${property_name || 'active property'}`);
    
    // CRITICAL: Check authentication before processing user request
    const authCheck = checkAuthenticationOnly(realEstateAgent, 'showPropertyBrochure');
    
    if (authCheck.needs_authentication) {
        console.log("[showPropertyBrochure] 🚨 Authentication required - transferring to authentication agent");
        return {
            destination_agent: authCheck.destination_agent,
            flow_context: authCheck.flow_context,
            came_from: authCheck.came_from,
            pending_question: authCheck.pending_question,
            message: null,
            silentTransfer: authCheck.silentTransfer
        };
    }

    try {
      console.log('[showPropertyBrochure] Called with params:', { property_name });

      // Get the property name from params or try to detect from context
      let propertyName = property_name;
      
      if (!propertyName) {
        // Try to get from recent conversation context
        const recentMessages = transcript
          .filter(item => item.type === 'MESSAGE' && item.role === 'user')
          .slice(-5); // Look at last 5 user messages
        
        console.log('[showPropertyBrochure] Looking for property name in recent messages:', recentMessages);
        
        // Look for property mentions in recent messages
        for (const message of recentMessages.reverse()) {
          const text = message.text?.toLowerCase() || '';
          console.log('[showPropertyBrochure] Checking message:', text);
          
          // Enhanced property name detection
          if (text.includes('brochure') || text.includes('property') || text.includes('share')) {
            // Look for common property name patterns
            const patterns = [
              /brochure.*?of\s+([a-zA-Z0-9\s]+)/i,
              /show.*?brochure.*?([a-zA-Z0-9\s]+)/i,
              /([a-zA-Z0-9\s]+).*?brochure/i
            ];
            
            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (match && match[1]) {
                propertyName = match[1].trim();
                console.log('[showPropertyBrochure] Extracted property name:', propertyName);
                break;
              }
            }
            
            if (propertyName) break;
          }
        }
      }

      // Try to get property data from the agent's metadata or database
      const agentMetadata = realEstateAgent?.metadata;
      let propertyData = null;
      let projectIdToFetch = null;

      console.log('[showPropertyBrochure] Agent metadata:', agentMetadata);

      // Priority 1: Use active_project_id if available
      if (agentMetadata?.active_project_id) {
        projectIdToFetch = agentMetadata.active_project_id;
        console.log('[showPropertyBrochure] Using active_project_id:', projectIdToFetch);
      }
      // Priority 2: Use first project ID from project_ids array
      else if (agentMetadata?.project_ids && agentMetadata.project_ids.length > 0) {
        projectIdToFetch = agentMetadata.project_ids[0];
        console.log('[showPropertyBrochure] Using first project_id from array:', projectIdToFetch);
      }
      // Priority 3: Try to get project ID from project_id_map using property name
      else if (propertyName && agentMetadata?.project_id_map && agentMetadata.project_id_map[propertyName]) {
        projectIdToFetch = agentMetadata.project_id_map[propertyName];
        console.log('[showPropertyBrochure] Using project_id from map for', propertyName, ':', projectIdToFetch);
      }
      // Priority 4: Try to find project ID from project_id_map using any available project name
      else if (agentMetadata?.project_names && agentMetadata.project_names.length > 0 && agentMetadata?.project_id_map) {
        const firstProjectName = agentMetadata.project_names[0];
        projectIdToFetch = agentMetadata.project_id_map[firstProjectName];
        propertyName = firstProjectName; // Set the property name
        console.log('[showPropertyBrochure] Using first project from project_names:', firstProjectName, 'ID:', projectIdToFetch);
      }

      // Fetch property data using project ID if we have one
      if (projectIdToFetch) {
        try {
          const { getProjectDetails } = await import('./getProjectDetails');
          console.log('[showPropertyBrochure] Fetching project data with ID (may use cache):', projectIdToFetch);
          const result = await getProjectDetails(
            { project_id: projectIdToFetch }, 
            realEstateAgent
          );
          
          if (result.properties && result.properties.length > 0) {
            propertyData = result.properties[0];
            propertyName = propertyData.name;
            console.log('[showPropertyBrochure] Using property data from properties array:', propertyName);
          } else if (result.property_details) {
            propertyData = result.property_details;
            propertyName = propertyData.name;
            console.log('[showPropertyBrochure] Using property data from property_details:', propertyName);
          }
        } catch (error) {
          console.error('[showPropertyBrochure] Error fetching project by ID:', error);
        }
      }

      // If we have a property name but no data yet, try to fetch by name (with caching)
      if (propertyName && !propertyData) {
        try {
          const { getProjectDetails } = await import('./getProjectDetails');
          console.log('[showPropertyBrochure] Fetching property by name (may use cache):', propertyName);
          const result = await getProjectDetails(
            { project_name: propertyName }, 
            realEstateAgent
          );
          
          if (result.properties && result.properties.length > 0) {
            propertyData = result.properties[0];
            console.log('[showPropertyBrochure] Found property data by name');
          } else if (result.property_details) {
            propertyData = result.property_details;
            console.log('[showPropertyBrochure] Found property details by name');
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
            realEstateAgent
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
      let brochureUrl = null;

      if (propertyData?.brochure && propertyData.brochure.trim() !== '') {
        brochureUrl = propertyData.brochure;
      }

      // If no brochure URL found, return an error instead of dummy URL
      if (!brochureUrl) {
        return {
          success: false,
          message: `Sorry, the brochure for ${propertyName} is not available at the moment. Please contact us for more information.`,
          ui_display_hint: 'BROCHURE_VIEWER',
          brochure_data: {
            propertyName: propertyName,
            brochureUrl: ""
          },
          error: "No brochure URL available"
        };
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
          message: "Sorry, I couldn't retrieve the brochure at the moment. Please try again later or contact us for assistance.",
          ui_display_hint: 'BROCHURE_VIEWER',
          brochure_data: {
            propertyName: property_name || "Property",
            brochureUrl: ""
          },
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
} 