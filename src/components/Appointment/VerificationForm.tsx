"use client"

import React, { useState, useCallback } from "react";
import { motion, Variants } from "framer-motion";

// OPTIMIZED ANIMATION CONFIGURATIONS
const FAST_TRANSITION = { duration: 0.1, ease: "easeOut" };
const INSTANT_TRANSITION = { duration: 0.05, ease: "easeOut" };

// Animation variants (optimized for speed)
const containerVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...FAST_TRANSITION,
      when: "beforeChildren",
      staggerChildren: 0.03, // Much faster stagger
    },
  },
  exit: { opacity: 0, y: 15, transition: INSTANT_TRANSITION },
};

const childVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: FAST_TRANSITION },
};

// Country codes data - simplified for mobile
const countryCodes = [
  { code: "+91", country: "India" },
  { code: "+1", country: "US/CA" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "AU" },
  { code: "+86", country: "China" },
  { code: "+81", country: "Japan" },
  { code: "+49", country: "Germany" },
  { code: "+33", country: "France" },
  { code: "+39", country: "Italy" },
  { code: "+7", country: "Russia" },
  { code: "+34", country: "Spain" },
  { code: "+55", country: "Brazil" },
  { code: "+52", country: "Mexico" },
  { code: "+65", country: "SG" },
  { code: "+971", country: "UAE" },
].sort((a, b) => a.country.localeCompare(b.country));

interface VerificationFormProps {
  onSubmit?: (name: string, phone: string) => void;
}

const VerificationForm: React.FC<VerificationFormProps> = ({ onSubmit }) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Optimized submit handler with better debouncing protection
  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting || !name.trim() || !phone.trim()) {
      console.log("🔐 [Verification Form] Submit blocked:", { isSubmitting, name: !!name.trim(), phone: !!phone.trim() });
      return;
    }
    
    console.log("🔐 [Verification Form] Starting submission...");
    setIsSubmitting(true);
    
    try {
      const fullPhoneNumber = `${countryCode}${phone.replace(/^\+/, "")}`;
      console.log("🔐 [Verification Form] Submitting:", { name: name.trim(), phone: fullPhoneNumber });
      
      // Call the onSubmit callback
      if (onSubmit) {
        await onSubmit(name.trim(), fullPhoneNumber);
      }
      
      // Success - reset submitting state after successful submission
      console.log("🔐 [Verification Form] ✅ Submission completed successfully");
      setIsSubmitting(false);
      
    } catch (error) {
      console.error("🔐 [Verification Form] Submission error:", error);
      setIsSubmitting(false); // Reset on error
    }
  }, [name, phone, countryCode, onSubmit, isSubmitting]);

  // Optimized input handlers
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers
    const value = e.target.value.replace(/[^\d]/g, '');
    setPhone(value);
  }, []);

  const handleCountryCodeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setCountryCode(e.target.value);
  }, []);

  const isFormValid = name.trim().length > 0 && phone.trim().length > 0;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="p-6 mx-4 bg-white text-gray-800 rounded-2xl w-full max-w-md mx-auto shadow-2xl border border-gray-200"
    >
      <motion.h3 variants={childVariants} className="text-2xl font-bold mb-2 text-center text-gray-800">
        Verification Required
      </motion.h3>
      <motion.p variants={childVariants} className="text-sm mb-8 text-center text-gray-600 leading-relaxed">
        Please provide your contact details:
      </motion.p>
      
      <form onSubmit={handleSubmit} className="w-full space-y-6">
        <motion.div variants={childVariants} className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            className="w-full p-4 text-gray-800 rounded-xl bg-gray-50 placeholder-gray-400 border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 font-medium shadow-sm"
            placeholder="Enter your full name"
            required
            disabled={isSubmitting}
            autoComplete="name"
          />
        </motion.div>

        <motion.div variants={childVariants} className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700">Phone Number</label>
          <div className="flex gap-2 w-full">
            <select
              value={countryCode}
              onChange={handleCountryCodeChange}
              className="w-20 p-2.5 text-gray-800 rounded-xl bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm font-bold shadow-sm shrink-0"
              disabled={isSubmitting}
            >
              {countryCodes.map(({ code }) => (
                <option key={code} value={code} className="text-sm font-medium">
                  {code}
                </option>
              ))}
            </select>
            <input
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              className="flex-1 min-w-0 p-2.5 text-gray-800 rounded-xl bg-gray-50 placeholder-gray-400 border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm font-medium shadow-sm"
              placeholder="Enter phone number"
              required
              disabled={isSubmitting}
              autoComplete="tel"
              maxLength={15}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 px-1">
            Selected: {countryCode} ({countryCodes.find(c => c.code === countryCode)?.country})
          </p>
        </motion.div>

        <motion.button
          variants={childVariants}
          type="submit"
          disabled={!isFormValid || isSubmitting}
          className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-200 mt-8 shadow-lg ${
            !isFormValid || isSubmitting
              ? "bg-gray-300 text-gray-500 cursor-not-allowed opacity-50"
              : "bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-98 hover:shadow-xl"
          }`}
          whileTap={{ scale: (!isFormValid || isSubmitting) ? 1 : 0.98 }}
          whileHover={{ scale: (!isFormValid || isSubmitting) ? 1 : 1.02 }}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-3">
              <motion.div 
                className="w-5 h-5 border-3 border-white border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              Submitting...
            </span>
          ) : (
            "Submit Details"
          )}
        </motion.button>
      </form>
    </motion.div>
  );
};

export default VerificationForm; 