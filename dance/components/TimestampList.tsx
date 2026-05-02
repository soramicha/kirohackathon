'use client';

interface Timestamp {
  id: string;
  time: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

interface TimestampListProps {
  timestamps: Timestamp[];
  onProcess: (timestamp: Timestamp) => void;
  onRemove: (id: string) => void;
}

export default function TimestampList({ timestamps, onProcess, onRemove }: TimestampListProps) {
  if (timestamps.length === 0) {
    return (
      <div className="w-full max-w-4xl p-8 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500 dark:border-gray-600">
        No timestamps captured yet. Use the "Capture Timestamp" button to add timestamps.
      </div>
    );
  }

  const getStatusColor = (status: Timestamp['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
      case 'processing':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'completed':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'error':
        return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
    }
  };

  return (
    <div className="w-full max-w-4xl">
      <h3 className="text-lg font-semibold mb-4">Captured Timestamps</h3>
      <div className="space-y-2">
        {timestamps.map((timestamp) => (
          <div
            key={timestamp.id}
            className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            <div className="flex items-center gap-4">
              <span className="font-mono font-medium text-lg">
                {timestamp.time.toFixed(2)}s
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(timestamp.status)}`}>
                {timestamp.status}
              </span>
            </div>
            <div className="flex gap-2">
              {timestamp.status === 'pending' && (
                <button
                  onClick={() => onProcess(timestamp)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Process
                </button>
              )}
              <button
                onClick={() => onRemove(timestamp.id)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
