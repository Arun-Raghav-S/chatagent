"use client"

import React, { forwardRef } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Mic, MicOff, Phone, Send, PhoneOff, Loader } from "lucide-react";
import { SessionStatus } from '../types';

interface ChatControlsProps {
  inputVisible: boolean;
  inputValue: string;
  sessionStatus: SessionStatus;
  micMuted: boolean;
  onToggleInput: () => void;
  onToggleMic: () => void;
  onCallButtonClick: () => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  chatbotId?: string;
}

export const ChatControls = forwardRef<HTMLInputElement, ChatControlsProps>(({
  inputVisible,
  inputValue,
  sessionStatus,
  micMuted,
  onToggleInput,
  onToggleMic,
  onCallButtonClick,
  onInputChange,
  onSend,
  onKeyDown,
  chatbotId
}, ref) => {
  return (
    <div className="mt-auto flex-shrink-0 z-20">
      <AnimatePresence>
        {inputVisible && (
          <motion.div
            initial={{ y: 60 }} 
            animate={{ y: 0 }} 
            exit={{ y: 60 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="rounded-xl w-[320px] -mb-1 ml-1 h-[48px] shadow-lg bg-[#47679D]"
          >
            <div className="flex items-center justify-between w-full px-4 py-2 rounded-lg">
              <input
                ref={ref} 
                type="text" 
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)} 
                onKeyDown={onKeyDown}
                placeholder={sessionStatus === 'CONNECTED' ? "Type your message..." : "Connect call to type"}
                className="flex-1 mt-1 bg-transparent outline-none text-white placeholder:text-white placeholder:opacity-50 text-sm"
                disabled={sessionStatus !== 'CONNECTED'}
              />
              <button 
                onClick={onSend} 
                className="ml-2 mt-1 text-white disabled:opacity-50" 
                disabled={sessionStatus !== 'CONNECTED' || !inputValue.trim()}
              > 
                <Send size={18} /> 
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Button Bar */}
      <div className="flex justify-between items-center p-3 bg-blue-900">
        <button 
          onClick={onToggleInput} 
          className="bg-[#47679D] p-3 rounded-full hover:bg-blue-600 transition-colors"
        > 
          <MessageSquare size={20} /> 
        </button>
        
        <div className="flex justify-center space-x-1"> 
          {Array(15).fill(0).map((_, i) => (
            <div key={i} className="w-1 h-1 bg-white rounded-full opacity-50"></div>
          ))} 
        </div>
        
        <button 
          onClick={onToggleMic} 
          className={`p-3 rounded-full transition-colors ${micMuted ? 'bg-gray-600' : 'bg-[#47679D] hover:bg-blue-600'}`}
          disabled={sessionStatus !== 'CONNECTED'}
          title={micMuted ? "Mic Off" : "Mic On"}
        > 
          {micMuted ? <MicOff size={20} /> : <Mic size={20} />} 
        </button>
        
        <button 
          onClick={onCallButtonClick}
          className={`${sessionStatus === 'CONNECTED' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} p-3 rounded-full transition-colors disabled:opacity-70`}
          disabled={sessionStatus === 'CONNECTING' || (!chatbotId && sessionStatus === 'DISCONNECTED')}
        >
          {sessionStatus === 'CONNECTING' ? (
            <Loader size={18} className="animate-spin"/>
          ) : sessionStatus === 'CONNECTED' ? (
            <PhoneOff size={18} />
          ) : (
            <Phone size={18} />
          )}
        </button>
      </div>
    </div>
  );
});

ChatControls.displayName = 'ChatControls'; 