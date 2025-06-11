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
  }, [otp])

  // Optimized submit handler with debouncing protection
  const handleSubmit = useCallback(async () => {
    if (!isComplete || isSubmitting) return

    setIsSubmitting(true)
    
    try {
      const otpString = otp.join("")
      console.log("🔐 [OTP Input] Submitting OTP:", otpString)
      
      // Call the onSubmit callback immediately for better UX
      onSubmit(otpString)
    } catch (error) {
      console.error("🔐 [OTP Input] Submission error:", error)
    } finally {
      // Reset after a short delay to prevent multiple submissions
      setTimeout(() => setIsSubmitting(false), 500)
    }
  }, [otp, isComplete, isSubmitting, onSubmit])

  // Auto-submit when complete
  useEffect(() => {
    if (isComplete && !isSubmitting) {
      const timer = setTimeout(() => {
        handleSubmit()
      }, 300) // Small delay for better UX
      
      return () => clearTimeout(timer)
    }
  }, [isComplete, isSubmitting, handleSubmit])

  return (
    <motion.div
      className="p-4 bg-[#0b3d91] text-white rounded-xl w-full max-w-md mx-auto"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={FAST_TRANSITION}
    >
      <motion.h3 
        className="text-xl font-bold mb-4 text-center"
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
            className={`w-12 h-12 text-center text-xl font-bold bg-white text-gray-900 rounded-xl border-2 transition-all duration-200 focus:ring-2 focus:ring-blue-400 focus:border-blue-500 ${
              digit ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400'}`}
            disabled={isSubmitting}
          />
        ))}
      </motion.div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 px-2">
        {onCancel && (
          <motion.button
            onClick={onCancel}
            className="w-full sm:flex-1 px-4 py-3 bg-blue-700 hover:bg-blue-600 transition-all duration-100 rounded-md active:scale-95"
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
          className={`w-full sm:flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-200 ${
            isComplete && !isSubmitting
              ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg' 
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
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
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
        className="text-xs text-center mt-6 opacity-70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ ...FAST_TRANSITION, delay: 0.2 }}
      >
        Didn't receive the code? <button className="text-blue-300 underline hover:text-blue-200 transition-colors duration-200 font-medium">Resend Code</button>
      </motion.p>
    </motion.div>
  )
}
