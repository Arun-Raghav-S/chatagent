"use client";

import React from "react";
import { CalendarClock, User, Building, Phone } from "lucide-react";

interface BookingDetailsCardProps {
  customerName: string;
  propertyName: string;
  date: string;
  time: string;
  phoneNumber?: string;
  onClose?: () => void;
}

const BookingDetailsCard: React.FC<BookingDetailsCardProps> = ({
  customerName,
  propertyName,
  date,
  time,
  phoneNumber,
  onClose
}) => {
  return (
    <div className="bg-white text-blue-900 rounded-xl shadow-lg p-5 w-full relative">
      <div className="flex items-center justify-between mb-4 bg-blue-50 rounded-lg p-3 relative">
        <div className="flex items-center justify-center flex-1">
          <CalendarClock size={32} className="text-blue-700" />
          <h2 className="text-xl font-bold ml-2">Booking Confirmed</h2>
        </div>
        
        {/* Close button - styled to match the card */}
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 bg-blue-100 hover:bg-blue-200 text-blue-700 hover:text-blue-800 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 opacity-70 hover:opacity-100 ml-2"
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center">
          <User size={18} className="text-blue-700 mr-3" />
          <div>
            <p className="text-sm text-blue-700 font-medium">Name</p>
            <p className="font-medium">{customerName}</p>
          </div>
        </div>
        
        <div className="flex items-center">
          <Building size={18} className="text-blue-700 mr-3" />
          <div>
            <p className="text-sm text-blue-700 font-medium">Property</p>
            <p className="font-medium">{propertyName}</p>
          </div>
        </div>
        
        <div className="flex items-center">
          <CalendarClock size={18} className="text-blue-700 mr-3" />
          <div>
            <p className="text-sm text-blue-700 font-medium">Date & Time</p>
            <p className="font-medium">{date} at {time}</p>
          </div>
        </div>
        
        {phoneNumber && (
          <div className="flex items-center">
            <Phone size={18} className="text-blue-700 mr-3" />
            <div>
              <p className="text-sm text-blue-700 font-medium">Phone Number</p>
              <p className="font-medium">{phoneNumber}</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-5 border-t border-blue-100 pt-4">
        <p className="text-center text-sm text-blue-700">
          We will send you a reminder before your visit.
        </p>
      </div>
    </div>
  );
};

export default BookingDetailsCard; 