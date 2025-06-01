"use client"

import React from 'react';
import { X } from "lucide-react";

interface ChatHeaderProps {
  onClose?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ onClose }) => {
  return (
    <div className="flex items-center p-4 border-b border-blue-800 flex-shrink-0">
      <div className="flex items-center">
        <div className="bg-white rounded-full p-1 mr-2">
          <div className="text-blue-800 w-8 h-8 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42" fill="none">
              <circle cx="21" cy="21" r="21" fill="white" />
              <path d="M15.9833 12.687L11 16.2194V30.1284H15.9833V12.687Z" fill="#2563EB" />
              <rect width="9.58318" height="4.98325" transform="matrix(-1 0 0 1 31.3162 25.1455)" fill="#2563EB" />
              <rect width="4.79159" height="7.85821" transform="matrix(-1 0 0 1 31.3162 17.2871)" fill="#2563EB" />
              <path d="M20.4589 9.45097L16.3664 12.0161L28.2862 21.0735L31.3162 17.2868L20.4589 9.45097Z" fill="#2563EB" />
              <g filter="url(#filter0_i_3978_26224)">
                <path d="M15.9833 12.687L16.7499 13.262V29.5534L15.9833 30.1284V12.687Z" fill="#6193FF" />
              </g>
              <g filter="url(#filter1_i_3978_26224)">
                <path d="M16.2157 12.7009L16.3665 12.0161L26.5735 19.773L25.8041 20.0584L16.2157 12.7009Z" fill="#3B71E6" />
              </g>
              <g filter="url(#filter2_i_3978_26224)">
                <path d="M25.7582 19.9701L26.5248 19.6826V25.145H25.7582V19.9701Z" fill="#3B71E6" />
              </g>
              <g filter="url(#filter3_i_3978_26224)">
                <path d="M21.7331 25.1455L20.9665 24.3789H25.7581L26.5247 25.1455H21.7331Z" fill="#3B71E6" />
              </g>
              <g filter="url(#filter4_i_3978_26224)">
                <path d="M20.9665 24.3779L21.7331 25.1446V30.1278L20.9665 29.5528V24.3779Z" fill="#6193FF" />
              </g>
              <path d="M25.7582 24.3779L26.5248 25.1446" stroke="#4B83FC" strokeWidth="0.0134678" strokeLinecap="round" />
              <path d="M25.7582 19.9701L26.5248 19.6826" stroke="#4B83FC" strokeWidth="0.0134678" strokeLinecap="round" />
              <defs>
                <filter id="filter0_i_3978_26224" x="15.9833" y="12.687" width="0.766663" height="17.8005" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                  <feOffset dy="0.359141" />
                  <feGaussianBlur stdDeviation="0.17957" />
                  <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                  <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                </filter>
                <filter id="filter1_i_3978_26224" x="16.2156" y="12.0161" width="10.3578" height="8.40162" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                  <feOffset dy="0.359141" />
                  <feGaussianBlur stdDeviation="0.17957" />
                  <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                  <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                </filter>
                <filter id="filter2_i_3978_26224" x="25.7582" y="19.6826" width="0.766663" height="5.82154" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                  <feOffset dy="0.359141" />
                  <feGaussianBlur stdDeviation="0.17957" />
                  <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                  <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                </filter>
                <filter id="filter3_i_3978_26224" x="20.9665" y="24.3789" width="5.55823" height="1.12574" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                  <feOffset dy="0.359141" />
                  <feGaussianBlur stdDeviation="0.17957" />
                  <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                  <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                </filter>
                <filter id="filter4_i_3978_26224" x="20.9665" y="24.3779" width="0.766663" height="6.10914" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                  <feOffset dy="0.359141" />
                  <feGaussianBlur stdDeviation="0.17957" />
                  <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" />
                  <feBlend mode="normal" in2="shape" result="effect1_innerShadow_3978_26224" />
                </filter>
              </defs>
            </svg>
          </div>
        </div>
        <span className="font-medium">Real Estate AI Agent</span>
      </div>
      <button 
        className="ml-auto p-2 hover:bg-blue-800 rounded-full"
        onClick={onClose}
      >
        <X size={20} />
      </button>
    </div>
  );
}; 