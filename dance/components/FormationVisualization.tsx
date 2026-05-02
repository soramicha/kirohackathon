'use client';

import { Formation } from '@/lib/types';
import Image from 'next/image';

interface FormationVisualizationProps {
  formation: Formation;
}

export default function FormationVisualization({ formation }: FormationVisualizationProps) {
  return (
    <div className="w-full max-w-4xl">
      <h3 className="text-lg font-semibold mb-4">
        Formation at {formation.timestamp_sec.toFixed(2)}s
      </h3>
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        {formation.formation_image_url ? (
          <Image
            src={formation.formation_image_url}
            alt="Top-down formation view"
            width={600}
            height={400}
            className="w-full border border-gray-300 dark:border-gray-600 rounded"
          />
        ) : (
          <div className="w-full h-96 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
            <p className="text-gray-500">Formation visualization not available</p>
          </div>
        )}
        
        <div className="mt-4">
          <h4 className="font-medium mb-2">Dancers: {formation.people.length}</h4>
          <div className="flex flex-wrap gap-2">
            {formation.people.map((person) => (
              <span
                key={person.id}
                className="px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded-full text-sm"
              >
                {person.display_name || person.label}
              </span>
            ))}
          </div>
        </div>
        
        {formation.stage_corners && (
          <div className="mt-4 text-xs text-gray-500">
            <p>Stage corners: {formation.stage_corners.length} points selected</p>
          </div>
        )}
      </div>
    </div>
  );
}
