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

// Country codes data
const countryCodes = [
  { code: "+1", country: "US/Canada" },
  { code: "+44", country: "UK" },
  { code: "+91", country: "India" },
  { code: "+61", country: "Australia" },
  { code: "+86", country: "China" },
  { code: "+81", country: "Japan" },
  { code: "+49", country: "Germany" },
  { code: "+33", country: "France" },
  { code: "+39", country: "Italy" },
  { code: "+7", country: "Russia" },
  { code: "+34", country: "Spain" },
  { code: "+55", country: "Brazil" },
  { code: "+52", country: "Mexico" },
  { code: "+65", country: "Singapore" },
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

  // Optimized submit handler with debouncing protection
  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (isSubmitting || !name.trim() || !phone.trim()) return;
    
    setIsSubmitting(true);
    
    try {
      const fullPhoneNumber = `${countryCode}${phone.replace(/^\+/, "")}`;
      console.log("🔐 [Verification Form] Submitting:", { name: name.trim(), phone: fullPhoneNumber });
      
      // Call the onSubmit callback immediately for better UX
      if (onSubmit) {
        onSubmit(name.trim(), fullPhoneNumber);
      }
    } catch (error) {
      console.error("🔐 [Verification Form] Submission error:", error);
    } finally {
      // Reset after a short delay to prevent multiple submissions
      setTimeout(() => setIsSubmitting(false), 500);
    }
  }, [name, phone, countryCode, onSubmit, isSubmitting]);

  // Optimized input handlers
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value);
  }, []);

  const handleCountryCodeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setCountryCode(e.target.value);
  }, []);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="p-4 bg-[#0b3d91] text-white rounded-xl w-full max-w-md mx-auto"
    >
      <motion.h3 variants={childVariants} className="text-lg font-semibold mb-3 text-center">
        Verification Required
      </motion.h3>
      <motion.p variants={childVariants} className="text-sm mb-4 text-center">
        Please provide your contact details:
      </motion.p>
      
      <form onSubmit={handleSubmit} className="w-full">
        <motion.div variants={childVariants} className="mb-3">
          <label className="block text-sm mb-1">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            className="w-full p-2 text-gray-900 rounded bg-white placeholder-gray-500 transition-all duration-75 focus:ring-2 focus:ring-blue-300"
            placeholder="Enter your full name"
            required
            disabled={isSubmitting}
          />
        </motion.div>

        <motion.div variants={childVariants} className="mb-4">
          <label className="block text-sm mb-1">Phone Number</label>
          <div className="flex">
            <select
              value={countryCode}
              onChange={handleCountryCodeChange}
              className="p-2 text-gray-900 rounded-l bg-white border-r border-gray-300 transition-all duration-75 focus:ring-2 focus:ring-blue-300"
              disabled={isSubmitting}
            >
              {countryCodes.map(({ code, country }) => (
                <option key={code} value={code}>
                  {code} {country}
                </option>
              ))}
            </select>
            <input
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              className="flex-1 p-2 text-gray-900 rounded-r bg-white placeholder-gray-500 transition-all duration-75 focus:ring-2 focus:ring-blue-300"
              placeholder="Enter phone number"
              required
              disabled={isSubmitting}
            />
          </div>
        </motion.div>

        <motion.button
          variants={childVariants}
          type="submit"
          disabled={!name.trim() || !phone.trim() || isSubmitting}
          className={`w-full py-2 px-4 rounded font-medium transition-all duration-100 active:scale-95 ${
            !name.trim() || !phone.trim() || isSubmitting
              ? "bg-gray-600 cursor-not-allowed opacity-50"
              : "bg-blue-600 hover:bg-blue-500 focus:ring-2 focus:ring-blue-300"
          }`}
          whileTap={{ scale: (!name.trim() || !phone.trim() || isSubmitting) ? 1 : 0.95 }}
          whileHover={{ scale: (!name.trim() || !phone.trim() || isSubmitting) ? 1 : 1.02 }}
        >
          {isSubmitting ? "Verifying..." : "Submit Details"}
        </motion.button>
      </form>
    </motion.div>
  );
};

export default VerificationForm; 