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
      const pastedOtp = value.slice(0, 6).split("")
      const newOtp = [...otp]
      pastedOtp.forEach((digit, i) => {
        if (index + i < 6 && /^\d$/.test(digit)) {
          newOtp[index + i] = digit
        }
      })
      setOtp(newOtp)
      
      // Focus the next empty input or the last input
      const nextIndex = Math.min(index + pastedOtp.length, 5)
      inputRefs.current[nextIndex]?.focus()
    } else if (/^\d$/.test(value)) {
      const newOtp = [...otp]
      newOtp[index] = value
      setOtp(newOtp)
      
      // Move to next input
      if (index < 5) {
        inputRefs.current[index + 1]?.focus()
      }
    }
  }, [otp])

  // Optimized key handler
  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }, [otp])

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
      onSubmit(otpString)
      
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
      }, 500) // Slightly longer delay for better UX
      
      return () => clearTimeout(timer)
    }
  }, [isComplete, isSubmitting, hasAutoSubmitted]) // Removed handleSubmit from dependencies

  return (
    <motion.div
      className="p-6 bg-[#0b3d91] text-white rounded-xl w-full max-w-sm mx-auto"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={FAST_TRANSITION}
    >
      <motion.h3 
        className="text-xl font-semibold mb-2 text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...FAST_TRANSITION, delay: 0.05 }}
      >
        🔐 Verification Code
      </motion.h3>
      
      <motion.p 
        className="text-sm mb-6 text-center opacity-90 leading-relaxed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9 }}
        transition={{ ...FAST_TRANSITION, delay: 0.1 }}
      >
        Enter the 6-digit code we sent to your phone
      </motion.p>

      <motion.div 
        className="flex justify-center gap-2 mb-6"
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
            maxLength={6}
            value={digit}
            onChange={(e) => handleOtpChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={`w-10 h-12 text-center text-lg font-bold bg-white text-gray-900 rounded-lg border-0 transition-all duration-200 focus:ring-2 focus:ring-blue-300 focus:scale-105 ${
              digit ? 'bg-blue-50 shadow-md' : 'bg-white'
            } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50'}`}
            disabled={isSubmitting}
          />
        ))}
      </motion.div>

      <div className="flex flex-col gap-3">
        {onCancel && (
          <motion.button
            onClick={onCancel}
            className="w-full px-4 py-3 bg-blue-700 hover:bg-blue-600 transition-all duration-200 rounded-lg font-medium active:scale-95"
            disabled={isSubmitting}
            type="button"
            whileTap={{ scale: isSubmitting ? 1 : 0.95 }}
            whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
          >
            Cancel
          </motion.button>
        )}
        
        <motion.button
          onClick={handleSubmit}
          className={`w-full px-4 py-3 rounded-lg font-semibold transition-all duration-200 ${
            isComplete && !isSubmitting
              ? 'bg-white text-blue-900 hover:bg-blue-50 shadow-lg active:scale-95' 
              : 'bg-blue-700 opacity-50 cursor-not-allowed text-gray-300'
          }`}
          disabled={!isComplete || isSubmitting}
          type="button"
          whileTap={{ scale: isComplete && !isSubmitting ? 0.95 : 1 }}
          whileHover={{ scale: isComplete && !isSubmitting ? 1.02 : 1 }}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <motion.div 
                className="w-4 h-4 border-2 border-blue-900 border-t-transparent rounded-full"
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
      </div>
      
      <motion.p 
        className="text-xs text-center mt-4 opacity-70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ ...FAST_TRANSITION, delay: 0.2 }}
      >
        Didn't receive the code? <button className="text-blue-300 underline hover:text-blue-200 transition-colors duration-200 font-medium">Resend Code</button>
      </motion.p>
    </motion.div>
  )
}
