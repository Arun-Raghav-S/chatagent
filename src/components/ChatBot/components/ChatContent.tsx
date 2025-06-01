"use client"

import React, { RefObject } from 'react';
import { ArrowLeft, CheckCircle } from "lucide-react";
import {
  ActiveDisplayMode,
  PropertyProps,
  PropertyGalleryData,
  LocationMapData,
  BrochureData,
  BookingDetails,
  VerificationData,
  TranscriptItem
} from '../types';

// Component imports
import PropertyList from "../../PropertyComponents/PropertyList";
import PropertyDetails from "../../PropertyComponents/propertyDetails";
import PropertyImageGallery from "../../PropertyComponents/PropertyImageGallery";
import LocationMap from "../../PropertyComponents/LocationMap";
import BrochureViewer from "../../PropertyComponents/brochureViewer";
import TimePick from "../../Appointment/timePick";
import VerificationForm from "../../Appointment/VerificationForm";
import OTPInput from "../../Appointment/otp";
import BookingDetailsCard from "../../Appointment/BookingDetailsCard";

interface ChatContentProps {
  activeDisplayMode: ActiveDisplayMode;
  lastAgentTextMessage: string | null;
  transcriptItems: TranscriptItem[];
  propertyListData: PropertyProps[] | null;
  selectedPropertyDetails: PropertyProps | null;
  propertyGalleryData: PropertyGalleryData | null;
  locationMapData: LocationMapData | null;
  brochureData: BrochureData | null;
  bookingDetails: BookingDetails | null;
  selectedProperty: PropertyProps | null;
  isVerifying: boolean;
  availableSlots: Record<string, string[]>;
  transcriptEndRef: RefObject<HTMLDivElement | null>;
  
  // Event handlers
  onPropertySelect: (property: PropertyProps) => void;
  onScheduleVisit: (property: PropertyProps) => void;
  onClosePropertyDetails: () => void;
  onCloseGallery: () => void;
  onCloseLocationMap: () => void;
  onCloseBrochure: () => void;
  onTimeSlotSelection: (date: string, time: string) => void;
  onVerificationSubmit: (name: string, phone: string) => void;
  onOtpSubmit: (otp: string) => void;
  onScheduleVisitRequest: (property: PropertyProps) => void;
}

export const ChatContent: React.FC<ChatContentProps> = ({
  activeDisplayMode,
  lastAgentTextMessage,
  transcriptItems,
  propertyListData,
  selectedPropertyDetails,
  propertyGalleryData,
  locationMapData,
  brochureData,
  bookingDetails,
  selectedProperty,
  isVerifying,
  availableSlots,
  transcriptEndRef,
  onPropertySelect,
  onScheduleVisit,
  onClosePropertyDetails,
  onCloseGallery,
  onCloseLocationMap,
  onCloseBrochure,
  onTimeSlotSelection,
  onVerificationSubmit,
  onOtpSubmit,
  onScheduleVisitRequest
}) => {
  return (
    <>
      {/* Back buttons for specific views */}
      {activeDisplayMode === 'IMAGE_GALLERY' && (
        <button
          onClick={onCloseGallery}
          className="mb-2 ml-4 self-start bg-blue-700 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center shadow"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back
        </button>
      )}

      {activeDisplayMode === 'LOCATION_MAP' && (
        <button
          onClick={onCloseLocationMap}
          className="mb-2 ml-4 self-start bg-blue-700 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center shadow"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back
        </button>
      )}

      {activeDisplayMode === 'BROCHURE_VIEWER' && (
        <button
          onClick={onCloseBrochure}
          className="mb-2 ml-4 self-start bg-blue-700 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg flex items-center shadow"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back
        </button>
      )}

      {/* Main Content Area */}
      <div className={`flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-blue-700 scrollbar-track-blue-800 ${activeDisplayMode === 'CHAT' && transcriptItems.length === 0 && !lastAgentTextMessage ? 'flex items-center justify-center' : 'space-y-4'}`}>
        
        {activeDisplayMode === 'PROPERTY_LIST' && propertyListData && (
          <PropertyList 
            properties={propertyListData}
            onScheduleVisit={onScheduleVisit} 
            onPropertySelect={onPropertySelect}
          />
        )}

        {activeDisplayMode === 'SCHEDULING_FORM' && selectedProperty && !isVerifying && (
          <div className="relative w-full">
            <TimePick
              schedule={Object.keys(availableSlots).length > 0 ? availableSlots : {
                'Monday': ['11:00 AM', '4:00 PM'],
                'Tuesday': ['11:00 AM', '4:00 PM'],
                'Wednesday': ['11:00 AM', '4:00 PM']
              }}
              property={selectedProperty}
              onTimeSelect={onTimeSlotSelection}
            />
          </div>
        )}

        {activeDisplayMode === 'VERIFICATION_FORM' && (
          <div className="relative w-full">
            <VerificationForm onSubmit={onVerificationSubmit} /> 
          </div>
        )}

        {activeDisplayMode === 'OTP_FORM' && (
          <div className="relative w-full">
            <OTPInput onSubmit={onOtpSubmit} />
          </div>
        )}
        
        {activeDisplayMode === 'VERIFICATION_SUCCESS' && (
          <div className="flex flex-col items-center justify-center w-full py-8">
            <div className="bg-green-500 rounded-full p-3 mb-4">
              <CheckCircle size={40} className="text-white" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Verification Successful!</h3>
            <p className="text-center">
              Your phone number has been successfully verified. You can now proceed.
            </p>
          </div>
        )}

        {activeDisplayMode === 'IMAGE_GALLERY' && propertyGalleryData && (
          <div className="w-full">
            <PropertyImageGallery
              propertyName={propertyGalleryData.propertyName}
              images={propertyGalleryData.images}
              onClose={onCloseGallery} 
            />
          </div>
        )}

        {activeDisplayMode === 'LOCATION_MAP' && locationMapData && (
          <div className="w-full">
            <LocationMap
              propertyName={locationMapData.propertyName}
              location={locationMapData.location}
              description={locationMapData.description}
              onClose={onCloseLocationMap} 
            />
          </div>
        )}

        {activeDisplayMode === 'BROCHURE_VIEWER' && brochureData && (
          <div className="w-full p-4">
            <BrochureViewer
              propertyName={brochureData.propertyName}
              brochureUrl={brochureData.brochureUrl}
              onClose={onCloseBrochure} 
            />
          </div>
        )}
        
        {activeDisplayMode === 'CHAT' && (
          <div className="flex flex-col justify-center items-center h-full text-center px-4">
            {lastAgentTextMessage && (
              <p className="text-white text-xl font-medium italic mb-10">
                {lastAgentTextMessage}
              </p>
            )}
            {!lastAgentTextMessage && transcriptItems.length === 0 && (
              <p className="text-white text-xl font-medium italic">How can I help you today?</p>
            )}
          </div>
        )}
        
        <div ref={transcriptEndRef} />

        {activeDisplayMode === 'BOOKING_CONFIRMATION' && bookingDetails && (
          <div className="relative w-full flex items-center justify-center">
            <BookingDetailsCard
              customerName={bookingDetails.customerName}
              propertyName={bookingDetails.propertyName}
              date={bookingDetails.date}
              time={bookingDetails.time}
              phoneNumber={bookingDetails.phoneNumber}
            />
          </div>
        )}
      </div>

      {/* User Transcription Overlay */}
      {activeDisplayMode === 'CHAT' && transcriptItems
        .filter(item => item.type === 'MESSAGE' && item.role === 'user' && item.status !== 'DONE')
        .slice(-1)
        .map(item => (
          <div key={item.itemId} className="absolute bottom-20 right-4 max-w-[80%] bg-blue-600 p-3 rounded-xl text-sm text-white rounded-br-none z-20 shadow-lg">
            {item.text || '[Transcribing...]'}
          </div>
      ))}

      {/* Property Details Modal */}
      {activeDisplayMode === 'PROPERTY_DETAILS' && selectedPropertyDetails && (
        <div className="absolute inset-0 bg-blue-900 bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-10 p-4">
          <div className="max-w-sm w-full">
            <PropertyDetails 
              {...selectedPropertyDetails}
              onClose={onClosePropertyDetails}
              onScheduleVisit={onScheduleVisitRequest}
            />
          </div>
        </div>
      )}
    </>
  );
}; 