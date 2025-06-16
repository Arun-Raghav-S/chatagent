"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import { motion } from "framer-motion"

// OPTIMIZED ANIMATION CONFIGURATIONS
const FAST_TRANSITION = { duration: 0.1, ease: "easeOut" };

interface OTPInputProps {
  onSubmit: (otp: string) => void
  onCancel?: () => void
}

export default function OTPInput({ onSubmit, onCancel }: OTPInputProps) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false) // Prevent multiple auto-submits
  const inputRefs = useRef<HTMLInputElement[]>([])

  // Optimized OTP change handler
  const handleOtpChange = useCallback((index: number, value: string) => {
    if (value.length > 1) {
      // Handle pasted content
      const pastedOtp = value.slice(0, 6).split("").filter(char => /^\d$/.test(char))
      const newOtp = [...otp]
      pastedOtp.forEach((digit, i) => {
        if (index + i < 6) {
          newOtp[index + i] = digit
        }
      })
      setOtp(newOtp)
      
      // Focus the next empty input or the last input
      const nextIndex = Math.min(index + pastedOtp.length, 5)
      inputRefs.current[nextIndex]?.focus()
    } else if (/^\d$/.test(value) || value === "") {
      const newOtp = [...otp]
      newOtp[index] = value
      setOtp(newOtp)
      
      // Move to next input only if we added a digit
      if (value && index < 5) {
        inputRefs.current[index + 1]?.focus()
      }
    }
  }, [otp])

  // Improved key handler with better backspace functionality
  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      const newOtp = [...otp]
      if (otp[index]) {
        // Clear current field if it has content
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        // Move to previous field and clear it if current field is empty
        newOtp[index - 1] = ""
        setOtp(newOtp)
        inputRefs.current[index - 1]?.focus()
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus()
    } else if (e.key === "Delete") {
      const newOtp = [...otp]
      newOtp[index] = ""
      setOtp(newOtp)
    }
  }, [otp])

  // Handle input focus for better UX
  const handleFocus = useCallback((index: number) => {
    // Select all text when focusing (for easier replacement)
    inputRefs.current[index]?.select()
  }, [])

  // Check if OTP is complete
  useEffect(() => {
    const complete = otp.every(digit => digit !== "")
    setIsComplete(complete)
    // Reset auto-submit flag when OTP is incomplete
    if (!complete) {
      setHasAutoSubmitted(false)
    }
  }, [otp])

  // Optimized submit handler with better protection
  const handleSubmit = useCallback(async () => {
    if (!isComplete || isSubmitting) {
      console.log("🔐 [OTP Input] Submit blocked:", { isComplete, isSubmitting })
      return
    }

    console.log("🔐 [OTP Input] Starting submission...")
    setIsSubmitting(true)
    
    try {
      const otpString = otp.join("")
      console.log("🔐 [OTP Input] Submitting OTP:", otpString)
      
      // Call the onSubmit callback
      await onSubmit(otpString)
      
      // Reset will happen when the component unmounts or when verification completes
      // Don't reset isSubmitting here - let the parent handle it
    } catch (error) {
      console.error("🔐 [OTP Input] Submission error:", error)
      // Reset on error only
      setIsSubmitting(false)
      setHasAutoSubmitted(false) // Allow retry
    }
  }, [otp, isComplete, isSubmitting, onSubmit])

  // Reset submission state when component unmounts or OTP changes
  useEffect(() => {
    return () => {
      console.log("🔐 [OTP Input] Component cleanup")
    }
  }, [])

  // Reset submission state after successful submission (external trigger)
  useEffect(() => {
    if (isSubmitting) {
      const resetTimer = setTimeout(() => {
        console.log("🔐 [OTP Input] Auto-reset after timeout")
        setIsSubmitting(false)
        setHasAutoSubmitted(false)
      }, 5000) // Reset after 5 seconds if no external reset
      
      return () => clearTimeout(resetTimer)
    }
  }, [isSubmitting])

  // Auto-submit when complete (with safeguards)
  useEffect(() => {
    if (isComplete && !isSubmitting && !hasAutoSubmitted) {
      console.log("🔐 [OTP Input] Triggering auto-submit...")
      setHasAutoSubmitted(true) // Prevent multiple auto-submits
      
      const timer = setTimeout(() => {
        handleSubmit()
      }, 300) // Shorter delay for better UX
      
      return () => clearTimeout(timer)
    }
  }, [isComplete, isSubmitting, hasAutoSubmitted]) // Removed handleSubmit from dependencies

  return (
    <motion.div
      className="p-8 bg-[#0b3d91] text-white rounded-2xl w-full max-w-md mx-auto shadow-2xl"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={FAST_TRANSITION}
    >
      <motion.h3 
        className="text-2xl font-bold mb-3 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...FAST_TRANSITION, delay: 0.05 }}
      >
        🔐 Verification Code
      </motion.h3>
      
      <motion.p 
        className="text-sm mb-8 text-center opacity-90 leading-relaxed px-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9 }}
        transition={{ ...FAST_TRANSITION, delay: 0.1 }}
      >
        Enter the 6-digit code we sent to your phone
      </motion.p>

      <motion.div 
        className="flex justify-center gap-2 mb-8 px-2"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...FAST_TRANSITION, delay: 0.15 }}
      >
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              if (el) inputRefs.current[index] = el
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleOtpChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onFocus={() => handleFocus(index)}
            className={`w-10 h-12 text-center text-lg font-bold bg-white text-gray-900 rounded-lg border-0 transition-all duration-200 focus:ring-2 focus:ring-blue-300 focus:scale-105 shadow-inner ${
              digit ? 'bg-blue-50 shadow-lg ring-2 ring-blue-200' : 'bg-white hover:bg-blue-50'
            } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
            disabled={isSubmitting}
            autoComplete="one-time-code"
          />
        ))}
      </motion.div>

      <div className="flex flex-col gap-4">
        <motion.button
          onClick={handleSubmit}
          className={`w-full px-6 py-4 rounded-xl font-bold text-lg transition-all duration-200 shadow-lg ${
            isComplete && !isSubmitting
              ? 'bg-white text-blue-900 hover:bg-blue-50 hover:shadow-xl active:scale-98 ring-0 focus:ring-3 focus:ring-blue-300' 
              : 'bg-blue-700 opacity-50 cursor-not-allowed text-gray-300'
          }`}
          disabled={!isComplete || isSubmitting}
          type="button"
          whileTap={{ scale: isComplete && !isSubmitting ? 0.98 : 1 }}
          whileHover={{ scale: isComplete && !isSubmitting ? 1.02 : 1 }}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-3">
              <motion.div 
                className="w-5 h-5 border-3 border-blue-900 border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              Verifying...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              ✓ Verify Code
            </span>
          )}
        </motion.button>

        {onCancel && (
          <motion.button
            onClick={onCancel}
            className="w-full px-6 py-3 bg-blue-700 hover:bg-blue-600 transition-all duration-200 rounded-xl font-medium active:scale-98 hover:shadow-md"
            disabled={isSubmitting}
            type="button"
            whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
            whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
          >
            Cancel
          </motion.button>
        )}
      </div>
      
      <motion.div 
        className="text-center mt-6 pt-4 border-t border-blue-400 border-opacity-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...FAST_TRANSITION, delay: 0.2 }}
      >
        <p className="text-xs opacity-75 mb-2">
          Didn't receive the code?
        </p>
        <button className="text-blue-300 underline hover:text-blue-200 transition-colors duration-200 font-medium text-sm">
          Resend Code
        </button>
      </motion.div>
    </motion.div>
  )
}
