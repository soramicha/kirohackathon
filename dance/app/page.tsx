'use client';

import { useState } from 'react';
import VideoInput from '@/components/VideoInput';
import VideoPlayer from '@/components/VideoPlayer';
import TimestampList from '@/components/TimestampList';
import DetectionOverlay from '@/components/DetectionOverlay';
import StageCalibration from '@/components/StageCalibration';
import FormationVisualization from '@/components/FormationVisualization';
import { Formation, Person } from '@/lib/types';

interface Timestamp {
  id: string;
  time: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

type WorkflowStep = 'input' | 'video' | 'detection' | 'calibration' | 'formation';

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [timestamps, setTimestamps] = useState<Timestamp[]>([]);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('input');
  
  // Processing state
  const [currentTimestamp, setCurrentTimestamp] = useState<Timestamp | null>(null);
  const [detectedPeople, setDetectedPeople] = useState<Person[]>([]);
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [formation, setFormation] = useState<Formation | null>(null);

  const handleVideoLoad = (url: string, id: string) => {
    setVideoUrl(url);
    setVideoId(id);
    setCurrentStep('video');
  };

  const handleTimestampCapture = (time: number) => {
    const newTimestamp: Timestamp = {
      id: `ts-${Date.now()}`,
      time,
      status: 'pending',
    };
    setTimestamps([...timestamps, newTimestamp]);
  };

  const handleRemoveTimestamp = (id: string) => {
    setTimestamps(timestamps.filter(ts => ts.id !== id));
  };

  const handleProcessTimestamp = async (timestamp: Timestamp) => {
    setCurrentTimestamp(timestamp);
    setTimestamps(timestamps.map(ts => 
      ts.id === timestamp.id ? { ...ts, status: 'processing' } : ts
    ));

    try {
      // Call backend API to extract frame and detect dancers
      const response = await fetch('/api/process-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: videoId,
          timestamp: timestamp.time,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to process frame');
      }

      const data = await response.json();
      
      // screenshot_url will be a data URL (base64) from the backend
      setScreenshotUrl(data.screenshot_url);
      setDetectedPeople(data.people);
      setCurrentStep('detection');
      
      setTimestamps(timestamps.map(ts => 
        ts.id === timestamp.id ? { ...ts, status: 'completed' } : ts
      ));
    } catch (error) {
      console.error('Error processing timestamp:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to process frame'}`);
      setTimestamps(timestamps.map(ts => 
        ts.id === timestamp.id ? { ...ts, status: 'error' } : ts
      ));
    }
  };

  const handleConfirmDetection = (updatedPeople: Person[]) => {
    setDetectedPeople(updatedPeople);
    setCurrentStep('calibration');
  };

  const handleStageCalibration = async (corners: { x: number; y: number }[]) => {
    try {
      // Call backend API to compute homography and generate formation
      const response = await fetch('/api/generate-formation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: videoId,
          timestamp: currentTimestamp?.time,
          people: detectedPeople,
          stage_corners: corners,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate formation');
      }

      const data = await response.json();
      setFormation(data.formation);
      setCurrentStep('formation');
    } catch (error) {
      console.error('Error generating formation:', error);
    }
  };

  const handleBackToVideo = () => {
    setCurrentStep('video');
    setCurrentTimestamp(null);
    setDetectedPeople([]);
    setScreenshotUrl('');
    setFormation(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Dance Formation Extractor
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Turn rehearsal footage into instant formation maps
          </p>
        </header>

        {/* Main Content */}
        <div className="flex flex-col items-center gap-8">
          {currentStep === 'input' && (
            <VideoInput onVideoLoad={handleVideoLoad} />
          )}

          {currentStep === 'video' && (
            <>
              <VideoPlayer
                videoId={videoId}
                onTimestampCapture={handleTimestampCapture}
              />
              <TimestampList
                timestamps={timestamps}
                onProcess={handleProcessTimestamp}
                onRemove={handleRemoveTimestamp}
              />
            </>
          )}

          {currentStep === 'detection' && (
            <>
              <button
                onClick={handleBackToVideo}
                className="self-start px-4 py-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                ← Back to Video
              </button>
              <DetectionOverlay
                screenshotUrl={screenshotUrl}
                people={detectedPeople}
                onConfirm={handleConfirmDetection}
              />
            </>
          )}

          {currentStep === 'calibration' && (
            <>
              <button
                onClick={handleBackToVideo}
                className="self-start px-4 py-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                ← Back to Video
              </button>
              <StageCalibration
                screenshotUrl={screenshotUrl}
                onCalibrate={handleStageCalibration}
              />
            </>
          )}

          {currentStep === 'formation' && formation && (
            <>
              <button
                onClick={handleBackToVideo}
                className="self-start px-4 py-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                ← Back to Video
              </button>
              <FormationVisualization formation={formation} />
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    // TODO: Implement export functionality
                    console.log('Export formation:', formation);
                  }}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  Export as PDF
                </button>
                <button
                  onClick={() => {
                    // TODO: Implement JSON export
                    const json = JSON.stringify(formation, null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `formation-${formation.timestamp_sec}s.json`;
                    a.click();
                  }}
                  className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
                >
                  Export as JSON
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>MVP - Snapshot-based formation extraction from YouTube videos</p>
        </footer>
      </div>
    </div>
  );
}
