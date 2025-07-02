import { useCallback, useRef, useEffect } from "react"
import { createRealtimeConnection } from "@/libs/realtimeConnection"
import { ServerEvent, SessionStatus } from "@/types/types"

export function useConnection(
  sessionStatus: SessionStatus,
  setSessionStatus: (status: SessionStatus) => void,
  addTranscriptMessage: (
    itemId: string,
    role: "user" | "assistant" | "system",
    text: string
  ) => void,
  handleServerEvent: (event: ServerEvent) => void,
  setAgentMetadata: (metadata: null) => void,
  initialSessionSetupDoneRef: React.MutableRefObject<boolean>
) {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const localHandleServerEventRef = useRef(handleServerEvent)

  useEffect(() => {
    localHandleServerEventRef.current = handleServerEvent
  }, [handleServerEvent])

  const connectToRealtime = useCallback(async () => {
    if (sessionStatus !== "DISCONNECTED") return
    setSessionStatus("CONNECTING")
    addTranscriptMessage("system-connect", "system", "Connecting...")

    try {
      console.log("Fetching ephemeral key from /api/session...")
      const tokenResponse = await fetch("/api/session", { method: "POST" })
      const data = await tokenResponse.json()

      if (!tokenResponse.ok || !data.client_secret?.value) {
        console.error("Failed to get session token:", data)
        const errorMsg =
          data?.error || "Could not get session token (missing client_secret.value)"
        addTranscriptMessage("system-conn-fail", "system", `Connection failed: ${errorMsg}`)
        setSessionStatus("DISCONNECTED")
        return
      }

      const EPHEMERAL_KEY = data.client_secret.value
      console.log("Ephemeral key value received.")

      if (!audioElementRef.current) {
        audioElementRef.current = document.createElement("audio")
        audioElementRef.current.autoplay = true
        if ('playsInline' in audioElementRef.current) {
          (audioElementRef.current as HTMLAudioElement & { playsInline: boolean }).playsInline = true
        }
        document.body.appendChild(audioElementRef.current)
        audioElementRef.current.style.display = "none"
      }

      console.log("Creating Realtime Connection...")
      const { pc, dc } = await createRealtimeConnection(
        EPHEMERAL_KEY,
        audioElementRef
      )
      pcRef.current = pc
      dcRef.current = dc

      dc.addEventListener("open", () => {
        console.log("Data Channel Opened")
      })

      dc.addEventListener("close", () => {
        console.log("Data Channel Closed")
        addTranscriptMessage("system-closed", "system", "Connection closed.")
        setSessionStatus("DISCONNECTED")
        pcRef.current = null
        dcRef.current = null
      })

      dc.addEventListener("error", (err: Event) => {
        console.error("Data Channel Error:", err)
        const errorMessage = err instanceof ErrorEvent ? err.message : "Unknown DC error"
        addTranscriptMessage(
          "system-dc-error",
          "system",
          `Connection error: ${errorMessage}`
        )
        setSessionStatus("DISCONNECTED")
      })

      dc.addEventListener("message", (e: MessageEvent) => {
        try {
          const serverEvent: ServerEvent = JSON.parse(e.data)
          localHandleServerEventRef.current(serverEvent)
        } catch (error) {
          console.error("Error parsing server event:", error, e.data)
        }
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"
      console.error("Error connecting to realtime:", err)
      addTranscriptMessage(
        "system-conn-error",
        "system",
        `Connection failed: ${errorMessage}`
      )
      setSessionStatus("DISCONNECTED")
    }
  }, [sessionStatus, addTranscriptMessage, setSessionStatus])

  const disconnectFromRealtime = useCallback(() => {
    if (!pcRef.current) return
    console.log("[Disconnect] Cleaning up WebRTC connection")
    addTranscriptMessage("system-disconnect", "system", "Disconnecting...")

    initialSessionSetupDoneRef.current = false

    try {
      if (audioElementRef.current) {
        audioElementRef.current.srcObject = null
        audioElementRef.current.pause()
        audioElementRef.current = null
      }

      pcRef.current.getSenders().forEach(sender => {
        sender.track?.stop()
      })
      pcRef.current.close()
    } catch (error) {
      console.error("[Disconnect] Error closing peer connection:", error)
    }

    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.close()
    } else {
      setSessionStatus("DISCONNECTED")
      pcRef.current = null
      dcRef.current = null
    }
    setAgentMetadata(null)
  }, [addTranscriptMessage, setSessionStatus, setAgentMetadata, initialSessionSetupDoneRef])

  return {
    pcRef,
    dcRef,
    audioElementRef,
    connectToRealtime,
    disconnectFromRealtime,
  }
} 