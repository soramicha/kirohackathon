'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';

interface Point {
  x: number;
  y: number;
}

interface StageCalibrationProps {
  screenshotUrl: string;
  onCalibrate: (corners: Point[]) => void;
}

export default function StageCalibration({ screenshotUrl, onCalibrate }: StageCalibrationProps) {
  const [corners, setCorners] = useState<Point[]>([]);
  const imageRef = useRef<HTMLDivElement>(null);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (corners.length >= 4) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const img = e.currentTarget.querySelector('img');
    if (!img) return;

    // Get click position relative to the container
    const containerX = e.clientX - rect.left;
    const containerY = e.clientY - rect.top;

    // Calculate relative position (0-1) based on actual image dimensions
    const relativeX = containerX / rect.width;
    const relativeY = containerY / rect.height;

    setCorners([...corners, { x: relativeX, y: relativeY }]);
  };

  const handleReset = () => {
    setCorners([]);
  };

  const handleConfirm = () => {
    if (corners.length === 4) {
      onCalibrate(corners);
    }
  };

  const cornerLabels = ['Top-Left', 'Top-Right', 'Bottom-Right', 'Bottom-Left'];

  return (
    <div className="w-full max-w-4xl">
      <h3 className="text-lg font-semibold mb-4">Stage Calibration</h3>
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Click on the four corners of the stage in order: Top-Left, Top-Right, Bottom-Right, Bottom-Left
        </p>

        <div
          ref={imageRef}
          onClick={handleImageClick}
          className="relative cursor-crosshair mb-4"
        >
          <Image
            src={screenshotUrl}
            alt="Stage calibration"
            width={800}
            height={450}
            className="w-full rounded"
          />
          {/* Draw corners */}
          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {corners.map((corner, index) => {
              // Convert relative coordinates (0-1) to SVG viewBox coordinates
              const svgX = `${corner.x * 100}%`;
              const svgY = `${corner.y * 100}%`;
              
              return (
                <g key={index}>
                  <circle
                    cx={svgX}
                    cy={svgY}
                    r="8"
                    fill="#ef4444"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text
                    x={svgX}
                    y={svgY}
                    dx="15"
                    dy="5"
                    fill="#ef4444"
                    fontSize="14"
                    fontWeight="bold"
                  >
                    {index + 1}
                  </text>
                </g>
              );
            })}
            {/* Draw lines between corners */}
            {corners.length > 1 && (
              <polyline
                points={corners.map(c => `${c.x * 100}%,${c.y * 100}%`).join(' ')}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
            )}
            {/* Close the polygon if all 4 corners are selected */}
            {corners.length === 4 && (
              <line
                x1={`${corners[3].x * 100}%`}
                y1={`${corners[3].y * 100}%`}
                x2={`${corners[0].x * 100}%`}
                y2={`${corners[0].y * 100}%`}
                stroke="#ef4444"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
            )}
          </svg>
        </div>

        <div className="mb-4">
          <h4 className="font-medium mb-2">Selected Corners: {corners.length}/4</h4>
          <div className="space-y-1 text-sm">
            {cornerLabels.map((label, index) => (
              <div
                key={index}
                className={`flex items-center gap-2 ${
                  corners[index] ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
                }`}
              >
                <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center">
                  {corners[index] && '✓'}
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Reset
          </button>
          <button
            onClick={handleConfirm}
            disabled={corners.length !== 4}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Confirm & Generate Formation
          </button>
        </div>
      </div>
    </div>
  );
}
