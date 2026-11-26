/**
 * "Show Alice": a live camera view that Alice watches while you talk (about one frame a second), so you can
 * ask "what am I looking at?" or "read this to me" without taking photos. Uses the PHONE's camera: the
 * glasses have no live video stream we can reach. Only runs while this view is open on screen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { live } from './live';
import { note } from './diary';
import { C, F, S } from './ui';

export function LiveCamera({ onClose }: { onClose: () => void }) {
  const [perm, ask] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [frames, setFrames] = useState(0);

  useEffect(() => { if (perm && !perm.granted) ask(); }, [perm]);
  useEffect(() => {
    if (live.state === 'off' || live.state === 'error') live.start();
    note('look-on');
    let busy = false;
    const t = setInterval(async () => {
      if (busy || !cam.current || live.state === 'off' || live.state === 'connecting') return;
      busy = true;
      try {
        const p = await cam.current.takePictureAsync({ quality: 0.35, base64: true, shutterSound: false, skipProcessing: true });
        if (p?.base64) { live.sendImage(p.base64); setFrames((n) => n + 1); }
      } catch {}
      busy = false;
    }, 1000);
    return () => { clearInterval(t); note('look-off', { frames }); };
  }, []);

  if (!perm?.granted) return <Text style={[S.dim, { textAlign: 'center' }]}>Allow camera access so Alice can see.</Text>;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 220, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.line }}>
        <CameraView ref={cam} style={{ flex: 1 }} facing="back" pictureSize="640x480" animateShutter={false} />
      </View>
      <Text style={[S.dim, { textAlign: 'center', fontFamily: F.regular }]}>Alice can see this. Ask "what am I looking at?" or "read this to me."</Text>
    </View>
  );
}
