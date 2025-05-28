"use client"

import React from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';

interface BrochureViewerProps {
  propertyName: string
  brochureUrl: string
  onClose: () => void
}

export default function BrochureViewer({
  propertyName,
  brochureUrl,
  onClose
}: BrochureViewerProps) {
  console.log("[BrochureViewer] Rendering with:", { propertyName, brochureUrl });

  const handleDownload = () => {
    // Create a temporary link element to trigger download
    const link = document.createElement('a')
    link.href = brochureUrl
    link.download = `${propertyName}-brochure.pdf`
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleViewOnline = () => {
    window.open(brochureUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-auto overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-50">
        <div className="flex items-center">
          <FileText size={20} className="text-blue-600 mr-2" />
          <h3 className="font-semibold text-gray-800">Property Brochure</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded-full transition-colors"
        >
          <X size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Property Name */}
        <h4 className="font-medium text-lg mb-4 text-gray-800">{propertyName}</h4>
        
        {/* Brochure Icon and Description */}
        <div className="text-center py-12">
          <FileText size={80} className="mx-auto mb-6 text-blue-600" />
          <p className="text-gray-600 mb-8 text-base leading-relaxed">
            Click the buttons below to download or view the brochure for {propertyName}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4">
          <button
            onClick={handleDownload}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-4 rounded-lg flex items-center justify-center transition-colors text-base"
          >
            <Download size={18} className="mr-3" />
            Download Brochure
          </button>
          
          <button
            onClick={handleViewOnline}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-4 px-4 rounded-lg flex items-center justify-center transition-colors text-base"
          >
            <ExternalLink size={18} className="mr-3" />
            View Online
          </button>
        </div>
      </div>
    </div>
  );
} 