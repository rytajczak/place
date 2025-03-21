'use client';
import { useEffect, useCallback, useState, useRef } from 'react';
import ColorPicker from './ColorPicker';
import CooldownTimer from './CooldownTimer';
import { useUser } from '@clerk/nextjs'
import { toast } from 'sonner';

type Pixel = {
  color: string;
  lastUpdated: number;
  lastUpdatedBy: string;
};

type CanvasState = {
  pixels: Pixel[][];
  size: number;
};

export default function Canvas() {
  const [canvasState, setCanvasState] = useState<CanvasState | null>(null);
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { isSignedIn, user } = useUser();
  const canvasRef = useRef<HTMLDivElement>(null);
  const pixelSize = 10; // Size of each pixel in pixels

  // Define fetchCanvasState function before it's used in useEffect
  const fetchCanvasState = useCallback(async () => {
    try {
      const response = await fetch('/api/canvas');
      if (!response.ok) {
        throw new Error('Failed to fetch canvas state');
      }
      const data = await response.json();
      
      setCanvasState(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching canvas state:', error);
      toast.error('Error fetching canvas. Try reloading.')
      setLoading(false);
    }
  }, []);

  // Initialize user ID and fetch canvas state
  useEffect(() => {
    fetchCanvasState();

    // Refresh canvas state every 5 seconds
    const intervalId = setInterval(fetchCanvasState, 5000);
    return () => clearInterval(intervalId);
  }, [fetchCanvasState]);

  const handlePixelClick = async (x: number, y: number) => {
    if (!isSignedIn || !user || !canvasState) {
      toast.error('You must be signed in to place a pixel');
      return;
    }
    
    // Check if user is on cooldown
    if (cooldownEnd && Date.now() < cooldownEnd) {
      const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
      toast.error(`Please wait ${remaining} seconds before placing another pixel`);
      return;
    }

    // Immediately update the canvas state for instant feedback
    setCanvasState(prevState => {
      if (!prevState) return null;
      
      // Create deep copy of the canvas state
      const newPixels = [...prevState.pixels.map(row => [...row])];
      
      // Update the specific pixel
      newPixels[y][x] = {
        color: selectedColor,
        lastUpdated: Date.now(),
        lastUpdatedBy: user.username || 'unknown',
      };
      
      return {
        ...prevState,
        pixels: newPixels,
      };
    });

    try {
      const response = await fetch('/api/canvas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          x,
          y,
          color: selectedColor,
          username: user.username,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          // Parse the remaining time from the error message
          const match = data.error.match(/wait (\d+) seconds/);
          if (match && match[1]) {
            const seconds = parseInt(match[1], 10);
            setCooldownEnd(Date.now() + seconds * 1000);
          } else {
            setCooldownEnd(Date.now() + 60 * 1000); // Default to 60 seconds
          }
          return;
        }
        toast.error('Failed to paint pixel');
        return;
      }

      // Set cooldown
      setCooldownEnd(Date.now() + 60 * 1000);
    } catch (error) {
      console.error('Error updating pixel:', error);
        toast.error('Failed to paint pixel');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading canvas...</div>;
  }

  if (!canvasState) {
    return <div className="text-red-500 text-center">There seems to have been an error. Try reloading.</div>;
  }

  if (!canvasState) {
    return <div className="flex jsutify-center items-center h-64">We lost the canvas somehow. Blame Robbie.</div>
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center mb-2 pt-8">
        <h2 className="text-xl font-bold mb-1">r/place Clone</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Click on a pixel to change its color. You can place one pixel per minute.
        </p>
        {user?.username && (
          <p className="text-xs text-gray-500 mt-1">Signed in as: {user.username}</p>
        )}
      </div>

      <div className="relative">
        <div 
          ref={canvasRef}
          className="grid border border-gray-300 dark:border-gray-700"
          style={{
            gridTemplateColumns: `repeat(${canvasState.size}, ${pixelSize}px)`,
            width: `${canvasState.size * pixelSize}px`,
            height: `${canvasState.size * pixelSize}px`,
          }}
        >
          {canvasState.pixels.map((row, y) =>
            row.map((pixel, x) => (
              <div
                key={`${x}-${y}`}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: pixel.color,
                  width: `${pixelSize}px`,
                  height: `${pixelSize}px`,
                }}
                onClick={() => handlePixelClick(x, y)}
                title={`(${x + 1}, ${y + 1}) - Placed by: ${pixel.lastUpdatedBy || 'unknown'}`}
              />
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
        <ColorPicker selectedColor={selectedColor} onColorChange={setSelectedColor} />
        <CooldownTimer cooldownEnd={cooldownEnd} />
      </div>
    </div>
  );
}
