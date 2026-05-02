'use client';

import { useState } from 'react';
import { Person } from '@/lib/types';
import Image from 'next/image';

interface DetectionOverlayProps {
  screenshotUrl: string;
  people: Person[];
  onConfirm: (updatedPeople: Person[]) => void;
}

export default function DetectionOverlay({ screenshotUrl, people, onConfirm }: DetectionOverlayProps) {
  const [editedPeople, setEditedPeople] = useState<Person[]>(people);
  const [showAddMode, setShowAddMode] = useState(false);
  const [expectedCount, setExpectedCount] = useState<number | null>(null);

  const handleNameChange = (id: number, newName: string) => {
    setEditedPeople(prev =>
      prev.map(person =>
        person.id === id ? { ...person, display_name: newName } : person
      )
    );
  };

  const handleRemovePerson = (id: number) => {
    setEditedPeople(prev => prev.filter(person => person.id !== id));
  };

  const handleAddPerson = () => {
    const newId = Math.max(0, ...editedPeople.map(p => p.id)) + 1;
    const newPerson: Person = {
      id: newId,
      label: `Person ${newId}`,
      display_name: '',
      bbox: {
        x: 100,
        y: 100,
        width: 80,
        height: 200,
      },
      center: { x: 140, y: 200 },
      floor_position: { x: 140, y: 300 },
    };
    setEditedPeople([...editedPeople, newPerson]);
    setShowAddMode(false);
  };

  const missingCount = expectedCount ? expectedCount - editedPeople.length : 0;

  return (
    <div className="w-full max-w-4xl">
      <h3 className="text-lg font-semibold mb-4">Detected Dancers</h3>
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="relative mb-4">
          <Image
            src={screenshotUrl}
            alt="Frame with detected dancers"
            width={800}
            height={450}
            className="w-full rounded"
          />
          {/* Bounding boxes are already drawn by the backend on the image */}
          {/* Frontend SVG overlay removed - was causing coordinate mismatch issues */}
        </div>

        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Detection Limitations:</strong> The model may miss dancers in large groups (7+) or partially visible dancers. 
            You can manually add or remove dancers below.
          </p>
        </div>

        {/* Expected count input */}
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <label className="block text-sm font-medium mb-2">
            How many dancers should be in this formation? (Optional)
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={expectedCount || ''}
            onChange={(e) => setExpectedCount(e.target.value ? parseInt(e.target.value) : null)}
            placeholder="e.g., 8"
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
          />
          {expectedCount && missingCount > 0 && (
            <p className="mt-2 text-sm text-orange-600 dark:text-orange-400">
              ⚠️ Missing {missingCount} dancer{missingCount > 1 ? 's' : ''}. 
              Click "Add Dancer" {missingCount} more time{missingCount > 1 ? 's' : ''}.
            </p>
          )}
          {expectedCount && missingCount < 0 && (
            <p className="mt-2 text-sm text-orange-600 dark:text-orange-400">
              ⚠️ Detected {Math.abs(missingCount)} extra dancer{Math.abs(missingCount) > 1 ? 's' : ''}. 
              Remove false positives or update expected count.
            </p>
          )}
          {expectedCount && missingCount === 0 && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
              ✓ Count matches! {editedPeople.length} dancers detected.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Dancers ({editedPeople.length})</h4>
            <button
              onClick={handleAddPerson}
              className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              + Add Dancer
            </button>
          </div>
          
          {editedPeople.map((person) => (
            <div key={person.id} className="flex items-center gap-3">
              <span className="font-mono text-sm w-20 flex-shrink-0">
                {person.label}
              </span>
              <input
                type="text"
                value={person.display_name || ''}
                onChange={(e) => handleNameChange(person.id, e.target.value)}
                placeholder="Custom name (optional)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
              />
              <button
                onClick={() => handleRemovePerson(person.id)}
                className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex-shrink-0"
                title="Remove this dancer"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => onConfirm(editedPeople)}
          className="mt-4 w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          Confirm & Continue to Stage Mapping
        </button>
      </div>
    </div>
  );
}
