import { useEffect, useRef, useState } from 'react';

interface VisualizerParams {
  isListening: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  analyserNode?: AnalyserNode | null;
  accentColor?: string; // CSS variable or color string
}

export function useAudioVisualizer({
  isListening,
  canvasRef,
  analyserNode,
  accentColor = '#6366f1',
}: VisualizerParams) {
  const [micVolume, setMicVolume] = useState(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const volumeRef = useRef(0);

  // Handle the canvas drawing animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Disable shadow blur by default to avoid pixel artifacts
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Read audio data if we have an analyser node and are listening
      let currentVolume: number;
      let dataArray: Uint8Array | null = null;
      let bufferLength = 0;

      if (isListening && analyserNode) {
        bufferLength = analyserNode.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analyserNode.getByteTimeDomainData(dataArray as any);

        // Compute Root Mean Square (RMS) volume for text and glow indicator
        let sumSquares = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = (dataArray[i] - 128) / 128; // scale to [-1, 1]
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);
        // Scale it to a nice 0 - 255 range
        currentVolume = Math.min(255, rms * 600);
      } else {
        currentVolume = 0;
      }

      // Smooth volume transitions (linear interpolation)
      volumeRef.current += (currentVolume - volumeRef.current) * 0.15;
      const smoothedVolume = volumeRef.current;
      setMicVolume(smoothedVolume);

      if (isListening && dataArray && bufferLength > 0) {
        // Draw real voice waves (Siri/Alexa-like multi-layered oscilloscope waves)
        const waveCount = 3;
        const baseAmplitude = (smoothedVolume / 255) * 45; // Max 45px amplitude

        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath();
          const opacity = 1 - w / waveCount;
          
          // Outer layers are more faded and slightly compressed
          ctx.strokeStyle = w === 0 
            ? accentColor 
            : `${accentColor}${Math.floor(opacity * 140).toString(16).padStart(2, '0')}`;
          
          ctx.lineWidth = w === 0 ? 3.5 : 1.5;

          // Draw the waveform line from left to right
          const sliceWidth = width / bufferLength;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            // Audio sample value scaled to [-1, 1]
            const v = (dataArray[i] - 128) / 128.0;

            // Add slight differences to secondary wave layers for aesthetic depth
            const layerScale = 1.0 - w * 0.25;
            
            // Fade the wave smooth to zero at the left and right edges (bell curve)
            const edgeScaler = Math.sin((i / bufferLength) * Math.PI);
            
            const y = height / 2 + v * baseAmplitude * layerScale * edgeScaler;

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            x += sliceWidth;
          }
          ctx.stroke();
        }
      } else {
        // Inactive: Draw a flat, elegant ambient line in center
        ctx.beginPath();
        ctx.strokeStyle = `${accentColor}33`; // Faded stroke
        ctx.lineWidth = 2.0;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      animationFrameIdRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [isListening, canvasRef, analyserNode, accentColor]);

  return { micVolume };
}
