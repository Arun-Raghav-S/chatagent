import { useRef, useCallback, useState, MutableRefObject } from 'react';
import { SessionStatus, ServerEvent } from '../types';
import { createRealtimeConnection } from "@/libs/realtimeConnection";
import { API_ENDPOINTS } from '../utils/constants';
import { generateSafeId } from '../utils/helpers';

interface UseWebRTCConnectionProps {
  handleServerEvent: (event: ServerEvent) => void;
  addTranscriptMessage: (itemId: string, role: "user" | "assistant" | "system", text: string) => void;
}

export const useWebRTCConnection = ({ 
  handleServerEvent, 
  addTranscriptMessage 
}: UseWebRTCConnectionProps) => {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("DISCONNECTED");
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const initialSessionSetupDoneRef = useRef<boolean>(false);

  // Send client event helper
  const sendClientEvent = useCallback((eventObj: any, eventNameSuffix = "") => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify(eventObj));
    } else {
      console.error(
        `[Send Event Error] Data channel not open. Attempted to send: ${eventObj.type} ${eventNameSuffix}`,
        eventObj
      );
      addTranscriptMessage(generateSafeId(), 'system', `Error: Could not send message. Connection lost.`);
      setSessionStatus("DISCONNECTED");
    }
  }, [addTranscriptMessage]);

  // Connect to realtime service
  const connectToRealtime = useCallback(async () => {
    if (sessionStatus !== "DISCONNECTED") return;
    setSessionStatus("CONNECTING");
    addTranscriptMessage(generateSafeId(), 'system', 'Connecting...');

    try {
      console.log("Fetching ephemeral key from /api/session...");
      const tokenResponse = await fetch(API_ENDPOINTS.SESSION, { method: "POST" });
      const data = await tokenResponse.json();

      if (!tokenResponse.ok || !data.client_secret?.value) { 
        console.error("Failed to get session token:", data);
        const errorMsg = data?.error || 'Could not get session token (missing client_secret.value)';
        addTranscriptMessage(generateSafeId(), 'system', `Connection failed: ${errorMsg}`);
        setSessionStatus("DISCONNECTED");
        return;
      }

      const EPHEMERAL_KEY = data.client_secret.value;
      console.log("Ephemeral key value received.");

      // Create audio element if it doesn't exist
      if (!audioElementRef.current) {
        audioElementRef.current = document.createElement("audio");
        audioElementRef.current.autoplay = true;
        (audioElementRef.current as any).playsInline = true;
        document.body.appendChild(audioElementRef.current);
        audioElementRef.current.style.display = 'none';
      }

      console.log("Creating Realtime Connection...");
      const { pc, dc } = await createRealtimeConnection(
        EPHEMERAL_KEY,
        audioElementRef
      );
      pcRef.current = pc;
      dcRef.current = dc;

      // Setup Data Channel Listeners
      dc.addEventListener("open", () => {
        console.log("Data Channel Opened");
      });

      dc.addEventListener("close", () => {
        console.log("Data Channel Closed");
        addTranscriptMessage(generateSafeId(), 'system', 'Connection closed.');
        setSessionStatus("DISCONNECTED");
        pcRef.current = null;
        dcRef.current = null;
      });

      dc.addEventListener("error", (err: any) => {
        console.error("Data Channel Error:", err);
        addTranscriptMessage(generateSafeId(), 'system', `Connection error: ${err?.message || 'Unknown DC error'}`);
        setSessionStatus("DISCONNECTED");
      });

      dc.addEventListener("message", (e: MessageEvent) => {
        try {
          const serverEvent: ServerEvent = JSON.parse(e.data);
          handleServerEvent(serverEvent);
        } catch (error) {
          console.error("Error parsing server event:", error, e.data);
        }
      });

    } catch (err: any) {
      console.error("Error connecting to realtime:", err);
      addTranscriptMessage(generateSafeId(), 'system', `Connection failed: ${err.message}`);
      setSessionStatus("DISCONNECTED");
    }
  }, [sessionStatus, addTranscriptMessage, handleServerEvent]);

  // Disconnect from realtime service
  const disconnectFromRealtime = useCallback(() => {
    if (!pcRef.current) return;
    console.log("[Disconnect] Cleaning up WebRTC connection");
    addTranscriptMessage(generateSafeId(), 'system', 'Disconnecting...');

    initialSessionSetupDoneRef.current = false; 

    try {
      // Properly cleanup audio element
      if (audioElementRef.current) {
        audioElementRef.current.srcObject = null;
        audioElementRef.current.pause();
        if (audioElementRef.current.parentNode) {
          audioElementRef.current.parentNode.removeChild(audioElementRef.current);
        }
        audioElementRef.current = null;
      }

      // Cleanup WebRTC
      pcRef.current.getSenders().forEach((sender) => {
        sender.track?.stop();
      });
      pcRef.current.close();
    } catch (error) {
      console.error("[Disconnect] Error closing peer connection:", error);
    }

    if (dcRef.current && dcRef.current.readyState === 'open') {
      dcRef.current.close();
    } else {
      setSessionStatus("DISCONNECTED");
      pcRef.current = null;
      dcRef.current = null;
    }
  }, [addTranscriptMessage]);

  // Initialize audio context when connected
  const initializeAudioContext = useCallback(() => {
    if (!audioContext) {
      try {
        const newAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(newAudioContext);
        console.log("[Audio] Audio context initialized");
      } catch (e) {
        console.error("[Audio] Error initializing audio context:", e);
      }
    }
  }, [audioContext]);

  return {
    sessionStatus,
    setSessionStatus,
    audioContext,
    pcRef,
    dcRef,
    audioElementRef,
    initialSessionSetupDoneRef,
    sendClientEvent,
    connectToRealtime,
    disconnectFromRealtime,
    initializeAudioContext
  };
};