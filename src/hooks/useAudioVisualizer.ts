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

    let time = 0;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      time += 0.05;
      
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Disable shadow blur by default to avoid pixel artifacts
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Read audio data if we have an analyser node and are listening
      let currentVolume = 0;
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
      } else if (isListening) {
        // Online Speech mode without raw mic node: generate pleasant dynamic activity
        currentVolume = 120 + Math.sin(time * 2) * 35;
      } else {
        currentVolume = 0;
      }

      // Smooth volume transitions (linear interpolation)
      volumeRef.current += (currentVolume - volumeRef.current) * 0.15;
      const smoothedVolume = volumeRef.current;
      setMicVolume(smoothedVolume);

      if (isListening) {
        const waveCount = 3;
        
        if (dataArray && bufferLength > 0) {
          // Draw real voice waves from analyser node (Offline / Whisper mode)
          const baseAmplitude = (smoothedVolume / 255) * 45; // Max 45px amplitude

          for (let w = 0; w < waveCount; w++) {
            ctx.beginPath();
            const opacity = 1 - w / waveCount;
            
            ctx.strokeStyle = w === 0 
              ? accentColor 
              : `${accentColor}${Math.floor(opacity * 140).toString(16).padStart(2, '0')}`;
            
            ctx.lineWidth = w === 0 ? 3.5 : 1.5;

            const sliceWidth = width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
              const v = (dataArray[i] - 128) / 128.0;
              const layerScale = 1.0 - w * 0.25;
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
          // Draw synthetic smooth ambient pulse wave (Online Web Speech mode)
          const sampleCount = 100;
          const sliceWidth = width / sampleCount;

          for (let w = 0; w < waveCount; w++) {
            ctx.beginPath();
            const opacity = 1 - w / waveCount;
            ctx.strokeStyle = w === 0 
              ? accentColor 
              : `${accentColor}${Math.floor(opacity * 140).toString(16).padStart(2, '0')}`;
            ctx.lineWidth = w === 0 ? 3 : 1.5;

            let x = 0;
            for (let i = 0; i <= sampleCount; i++) {
              const progress = i / sampleCount;
              const edgeScaler = Math.sin(progress * Math.PI); // smoothly fade edges to 0
              
              const freq1 = 4 + w;
              const freq2 = 2 + w * 0.5;
              const waveVal = Math.sin(progress * Math.PI * freq1 + time * (1.5 + w * 0.5)) * 0.6 +
                              Math.sin(progress * Math.PI * freq2 - time * 2) * 0.4;
              
              const amp = 14 * (1 - w * 0.25);
              const y = height / 2 + waveVal * amp * edgeScaler;

              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
              x += sliceWidth;
            }
            ctx.stroke();
          }
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
