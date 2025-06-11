"use client"

import React, { useState, useEffect, useCallback } from "react"
import BookingConfirmation from "./BookingConfirmation"
import AppointmentConfirmed from "./Confirmations"
import { motion, AnimatePresence, Variants } from "framer-motion"
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css'; // Import calendar CSS
import { X, ChevronLeft, ChevronRight } from "lucide-react"

// OPTIMIZED ANIMATION CONFIGURATIONS
const FAST_TRANSITION = { duration: 0.1, ease: "easeOut" };
const INSTANT_TRANSITION = { duration: 0.05, ease: "easeOut" };

interface PropertyUnit {
  type: string
}

interface Property {
  id: string
  name: string
  location?: {
    city?: string
    address?: string
  }
  price?: string
  area?: string
  description?: string
  mainImage?: string
  units?: PropertyUnit[]
}

interface TimingPickProps {
  schedule: Record<string, string[]>
  property: Property
  onTimeSelect: (selectedDate: string, selectedTime?: string) => void
}

// Optimized animation variants for faster transitions
const containerVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ...FAST_TRANSITION,
      when: "beforeChildren",
      staggerChildren: 0.02, // Much faster stagger
    },
  },
  exit: { opacity: 0, y: 15, transition: INSTANT_TRANSITION },
}

// Optimized child animation variants
const childVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: FAST_TRANSITION },
}

type Schedule = {
  [day: string]: string[] // Format: "Weekday, Month Day" -> ["11:00 AM", "4:00 PM"]
}

export default function TimePick({ schedule = {}, property, onTimeSelect }: TimingPickProps) {
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedTime, setSelectedTime] = useState<string>("")
  const [isDateSelected, setIsDateSelected] = useState(false)
  const [isTimeSelected, setIsTimeSelected] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  console.log("[TimePick] Component rendered with schedule:", schedule)
  console.log("[TimePick] Schedule keys:", Object.keys(schedule))

  // Get available dates from schedule
  const availableDates = Object.keys(schedule).filter(date => 
    schedule[date] && schedule[date].length > 0
  )

  console.log("[TimePick] Available dates:", availableDates)

  // Optimized date selection handler
  const handleDateSelect = useCallback((date: string) => {
    console.log(`[TimePick] Date selected: ${date}`)
    setSelectedDate(date)
    setSelectedTime("") // Reset time when date changes
    setIsDateSelected(true)
    setIsTimeSelected(false)
    
    // Notify parent immediately about date selection
    onTimeSelect(date)
  }, [onTimeSelect])

  // Optimized time selection handler
  const handleTimeSelect = useCallback((time: string) => {
    console.log(`[TimePick] Time selected: ${time} for date: ${selectedDate}`)
    setSelectedTime(time)
    setIsTimeSelected(true)
    
    // Notify parent immediately about complete selection
    onTimeSelect(selectedDate, time)
  }, [selectedDate, onTimeSelect])

  // Get available times for selected date
  const getAvailableTimesForDate = useCallback((date: string): string[] => {
    const times = schedule[date] || []
    console.log(`[TimePick] Available times for ${date}:`, times)
    return times
  }, [schedule])

  const availableTimes = selectedDate ? getAvailableTimesForDate(selectedDate) : []

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="p-4 bg-[#0b3d91] text-white rounded-xl w-full max-w-md mx-auto"
    >
      <motion.h3 
        variants={childVariants} 
        className="text-lg font-semibold mb-4 text-center"
      >
        Schedule Your Visit
      </motion.h3>
      
      <motion.div 
        variants={childVariants}
        className="mb-4 p-3 bg-blue-800 rounded-lg"
      >
        <h4 className="font-medium text-sm mb-1">{property.name}</h4>
        <p className="text-xs opacity-80">{property.location?.city || "Location available on request"}</p>
      </motion.div>

      {!isDateSelected ? (
        <motion.div variants={childVariants}>
          <h4 className="text-sm font-medium mb-3">Select a Date:</h4>
          {availableDates.length > 0 ? (
            <div className="space-y-2">
              {availableDates.map((date) => (
                <motion.button
                  key={date}
                  onClick={() => handleDateSelect(date)}
                  className="w-full p-3 text-left bg-blue-700 hover:bg-blue-600 rounded-lg transition-all duration-100 active:scale-98"
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.01 }}
                >
                  <span className="font-medium">{date}</span>
                  <span className="text-xs opacity-80 block">
                    {schedule[date]?.length || 0} time slots available
                  </span>
                </motion.button>
              ))}
            </div>
          ) : (
            <motion.div 
              className="text-center py-6 text-gray-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={FAST_TRANSITION}
            >
              <p className="text-sm">No available dates at the moment.</p>
              <p className="text-xs mt-1 opacity-80">Please check back later or contact us directly.</p>
            </motion.div>
          )}
        </motion.div>
      ) : !isTimeSelected ? (
        <motion.div 
          variants={childVariants}
          key="time-selection"
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">Select a Time:</h4>
            <motion.button
              onClick={() => {
                setIsDateSelected(false)
                setSelectedDate("")
                setSelectedTime("")
              }}
              className="text-xs text-blue-300 hover:text-white transition-colors duration-100"
              whileTap={{ scale: 0.95 }}
            >
              Change Date
            </motion.button>
          </div>
          
          <motion.div 
            className="mb-3 p-2 bg-blue-800 rounded text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={FAST_TRANSITION}
          >
            <span className="text-sm font-medium">{selectedDate}</span>
          </motion.div>

          {availableTimes.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {availableTimes.map((time) => (
                <motion.button
                  key={time}
                  onClick={() => handleTimeSelect(time)}
                  className="p-3 text-center bg-blue-700 hover:bg-blue-600 rounded-lg transition-all duration-100 active:scale-95"
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <span className="text-sm font-medium">{time}</span>
                </motion.button>
              ))}
            </div>
          ) : (
            <motion.div 
              className="text-center py-4 text-gray-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={FAST_TRANSITION}
            >
              <p className="text-sm">No available times for this date.</p>
            </motion.div>
          )}
        </motion.div>
      ) : (
        <motion.div 
          variants={childVariants}
          key="confirmation"
          className="text-center"
        >
          <motion.div 
            className="mb-4 p-4 bg-green-600 rounded-lg"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={FAST_TRANSITION}
          >
            <h4 className="font-medium mb-2">Visit Scheduled!</h4>
            <p className="text-sm opacity-90">
              <strong>{selectedDate}</strong> at <strong>{selectedTime}</strong>
            </p>
          </motion.div>
          
          <motion.p 
            className="text-sm text-gray-300 mb-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...FAST_TRANSITION, delay: 0.1 }}
          >
            You'll receive a confirmation message shortly.
          </motion.p>
          
          <motion.button
            onClick={() => {
              setIsDateSelected(false)
              setIsTimeSelected(false)
              setSelectedDate("")
              setSelectedTime("")
            }}
            className="text-sm text-blue-300 hover:text-white transition-all duration-100 active:scale-95"
            whileTap={{ scale: 0.95 }}
          >
            Schedule Another Visit
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  )
}