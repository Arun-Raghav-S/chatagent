"use client"

import React from 'react';
import { MessageSquare, Mic, Phone } from "lucide-react";
import { LANGUAGE_OPTIONS } from '../utils/constants';

interface IntroScreenProps {
  selectedLanguage: string;
  onLanguageSelect: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onProceed: () => void;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({ 
  selectedLanguage, 
  onLanguageSelect, 
  onProceed 
}) => {
  return (
    <div className="flex flex-col h-full items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-medium mb-6">
        Hey there, Please select a language
      </h2>
      
      <div className="relative w-full mb-8">
        <select
          value={selectedLanguage}
          onChange={onLanguageSelect}
          className="appearance-none bg-transparent py-2 pr-10 border-b-2 border-white w-full text-center text-xl font-medium focus:outline-none"
        >
          {LANGUAGE_OPTIONS.map(lang => (
            <option key={lang} value={lang} className="bg-blue-800 text-white">
              {lang}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
          <svg className="fill-current h-4 w-4" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
          </svg>
        </div>
      </div>
      
      <p className="text-xl mb-8">to continue.</p>
      
      <button 
        onClick={onProceed}
        className="bg-white text-blue-900 px-6 py-2 rounded-md font-medium hover:bg-blue-100 transition-colors"
      >
        Let's go
      </button>
      
      {/* Bottom buttons (decorative in intro) */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between items-center p-4 bg-blue-900">
        <button className="bg-[#47679D] p-3 rounded-full hover:bg-blue-600 transition-colors">
          <MessageSquare size={20} />
        </button>
        
        <div className="text-center">
          {/* Dots for decoration */}
          <div className="flex justify-center space-x-1">
            {Array(10).fill(0).map((_, i) => (
              <div key={i} className="w-1 h-1 bg-white rounded-full opacity-50"></div>
            ))}
          </div>
        </div>
        
        <button className="bg-[#47679D] p-3 rounded-full hover:bg-blue-600 transition-colors">
          <Mic size={20} />
        </button>
        
        <button className="bg-red-500 p-3 rounded-full hover:bg-red-600 transition-colors">
          <Phone size={18} />
        </button>
      </div>
    </div>
  );
}; 