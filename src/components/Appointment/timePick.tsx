"use client"

import React, { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, Calendar, Clock, ArrowLeft, X } from "lucide-react"
import { motion } from "framer-motion"

interface PropertyProps {
  id: string
  name: string
  price: string
  area: string
  description: string
  mainImage: string
}

interface TimePickProps {
  schedule: Record<string, string[]>
  property: PropertyProps
  onTimeSelect: (selectedDate: string, selectedTime?: string) => void
  onBack?: () => void // Go back to previous screen (property details or chat)
  onClose?: () => void // Close and return to chat
}

interface CalendarDay {
  date: Date
  dateString: string
  isCurrentMonth: boolean
  isToday: boolean
  isWeekday: boolean
  hasSlots: boolean
  timeSlots: string[]
}

const TimePick: React.FC<TimePickProps> = ({ schedule, property, onTimeSelect, onBack, onClose }) => {
  console.log("[TimePick] Component rendered with schedule:", schedule)
  console.log("[TimePick] Schedule keys:", Object.keys(schedule))
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedTime, setSelectedTime] = useState<string>("")
  const [showTimeSelection, setShowTimeSelection] = useState(false)

  const availableDates = Object.keys(schedule)
  console.log("[TimePick] Available dates:", availableDates)

  // Generate calendar for current month
  const generateCalendar = (date: Date): CalendarDay[] => {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    const startOfCalendar = new Date(startOfMonth)
    
    // Start from Monday of the week containing the first day
    const startDay = startOfMonth.getDay()
    const daysFromMonday = startDay === 0 ? 6 : startDay - 1
    startOfCalendar.setDate(startOfMonth.getDate() - daysFromMonday)
    
    const calendar: CalendarDay[] = []
    const current = new Date(startOfCalendar)
    
    // Generate 6 weeks (42 days) for a complete calendar view
    for (let i = 0; i < 42; i++) {
      const isCurrentMonth = current.getMonth() === date.getMonth()
      const isToday = current.toDateString() === new Date().toDateString()
      const dayOfWeek = current.getDay()
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5 // Monday to Friday
      
      // Create date string that matches the schedule format
      const dateString = current.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      })
      
      const hasSlots = schedule[dateString] && schedule[dateString].length > 0
      const timeSlots = schedule[dateString] || []
      
      calendar.push({
        date: new Date(current),
        dateString,
        isCurrentMonth,
        isToday,
        isWeekday,
        hasSlots,
        timeSlots
      })
      
      current.setDate(current.getDate() + 1)
    }
    
    return calendar
  }

  const calendar = generateCalendar(currentDate)
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]
  
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  const handleDateSelect = (day: CalendarDay) => {
    if (!day.isWeekday || !day.hasSlots) return
    
    setSelectedDate(day.dateString)
    setSelectedTime("")
    setShowTimeSelection(true)
    
    // 🔥 NEW: Send date-only selection to agent to trigger time selection message
    onTimeSelect(day.dateString) // Call without time parameter
  }

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time)
    // Format the selection for the parent component
    const formattedSelection = `${selectedDate} at ${time}`
    onTimeSelect(formattedSelection, time)
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 max-w-md mx-auto">
      {/* Header */}
      <div className="mb-6">
        {/* Navigation buttons - only show on calendar screen */}
        {!showTimeSelection && (onBack || onClose) && (
          <div className="flex justify-end mb-3">
            <div className="flex space-x-1">
              {onBack && (
                <motion.button
                  onClick={onBack}
                  className="bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-all duration-100 active:scale-95"
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.05 }}
                  title="Go back"
                >
                  <ArrowLeft size={18} className="text-gray-600" />
                </motion.button>
              )}
              
              {onClose && (
                <motion.button
                  onClick={onClose}
                  className="bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-all duration-100 active:scale-95"
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.05 }}
                  title="Close"
                >
                  <X size={18} className="text-gray-600" />
                </motion.button>
              )}
            </div>
          </div>
        )}
        
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Calendar className="text-blue-600 mr-2" size={24} />
            <h2 className="text-xl font-semibold text-gray-800">Schedule Visit</h2>
          </div>
          <p className="text-gray-600 text-sm">{property.name}</p>
        </div>
      </div>

      {!showTimeSelection ? (
        <>
          {/* Calendar Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            
            <h3 className="text-lg font-medium text-gray-800">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight size={20} className="text-gray-600" />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {/* Day headers */}
            {dayNames.map(day => (
              <div key={day} className="text-center py-2 text-sm font-medium text-gray-500">
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {calendar.map((day, index) => {
              const isSelectable = day.isWeekday && day.hasSlots && day.isCurrentMonth
              const isWeekend = !day.isWeekday
              
              return (
                <button
                  key={index}
                  onClick={() => handleDateSelect(day)}
                  disabled={!isSelectable}
                  className={`
                    aspect-square p-2 text-sm rounded-lg transition-all duration-200 relative
                    ${!day.isCurrentMonth ? 'text-gray-300' : ''}
                    ${day.isToday ? 'ring-2 ring-blue-500' : ''}
                    ${isWeekend ? 'text-gray-300 bg-gray-50' : ''}
                    ${isSelectable ? 'hover:bg-blue-50 hover:text-blue-600 cursor-pointer' : ''}
                    ${day.hasSlots && day.isWeekday && day.isCurrentMonth ? 'bg-blue-100 text-blue-700 font-medium' : ''}
                    ${!isSelectable ? 'cursor-not-allowed' : ''}
                  `}
                >
                  <span>{day.date.getDate()}</span>
                  {day.hasSlots && day.isWeekday && day.isCurrentMonth && (
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-blue-500 rounded-full"></div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center space-x-4 text-xs text-gray-500 mt-4">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-100 rounded mr-1"></div>
              <span>Available</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-gray-100 rounded mr-1"></div>
              <span>Weekend</span>
            </div>
          </div>

          {availableDates.length === 0 && (
            <div className="text-center py-8">
              <Calendar className="mx-auto text-gray-300 mb-2" size={48} />
              <p className="text-gray-500">No available dates at the moment</p>
              <p className="text-sm text-gray-400">Please try again later</p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Time Selection */}
          <div className="text-center mb-6">
            <button
              onClick={() => setShowTimeSelection(false)}
              className="text-blue-600 hover:text-blue-700 flex items-center mx-auto mb-4"
            >
              <ChevronLeft size={16} className="mr-1" />
              Back to Calendar
            </button>
            
            <div className="flex items-center justify-center mb-2">
              <Clock className="text-blue-600 mr-2" size={20} />
              <h3 className="text-lg font-medium text-gray-800">Select Time</h3>
            </div>
            <p className="text-gray-600 text-sm">{selectedDate}</p>
          </div>

          {/* Time Slots */}
          <div className="grid grid-cols-2 gap-3">
            {schedule[selectedDate]?.map((time, index) => (
              <button
                key={index}
                onClick={() => handleTimeSelect(time)}
                className={`
                  p-4 rounded-lg border transition-all duration-200
                  ${selectedTime === time 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                  }
                `}
              >
                <div className="text-center">
                  <div className="font-medium">{time}</div>
                </div>
              </button>
            ))}
          </div>

          {selectedTime && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg">
              <div className="text-center">
                <div className="text-green-700 font-medium mb-1">Visit Scheduled!</div>
                <div className="text-sm text-green-600">
                  {selectedDate} at {selectedTime}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default TimePick