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
import { coachFrameMs } from './coach';
import { C, F, S } from './ui';

export function LiveCamera({ onClose, hidden = false }: { onClose: () => void; hidden?: boolean }) {
  const [perm, ask] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [frames, setFrames] = useState(0);

  useEffect(() => { if (perm && !perm.granted) ask(); }, [perm]);
  useEffect(() => {
    if (live.state === 'off' || live.state === 'error') live.start();
    note('look-on');
    let busy = false, last = 0, alive = true;
    // About 1 picture a second; about 3 a second in workout coach mode so movement shows.
    const t = setInterval(async () => {
      if (busy || !cam.current || live.state === 'off' || live.state === 'connecting' || Date.now() - last < coachFrameMs()) return;
      busy = true; last = Date.now();
      try {
        const p = await cam.current.takePictureAsync({ quality: coachFrameMs() < 1000 ? 0.25 : 0.35, base64: true, shutterSound: false, skipProcessing: true });
        if (alive && p?.base64) { live.sendImage(p.base64); setFrames((n) => n + 1); }
      } catch {}
      busy = false;
    }, 100);
    return () => { alive = false; clearInterval(t); note('look-off', { frames }); };
  }, []);

  if (!perm?.granted) return <Text style={[S.dim, { textAlign: 'center' }]}>Allow camera access so Alice can see.</Text>;
  // Hidden: the camera still runs (iOS needs it on screen), shrunk to a dot, so Alice sees but you don't.
  if (hidden) return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <View style={{ width: 2, height: 2, overflow: 'hidden', opacity: 0.02 }}>
        <CameraView ref={cam} style={{ width: 2, height: 2 }} facing="back" pictureSize="640x480" animateShutter={false} />
      </View>
      <Text style={[S.dim, { textAlign: 'center', fontFamily: F.regular }]}>● Alice can see (camera view hidden)</Text>
    </View>
  );
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 220, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.line }}>
        <CameraView ref={cam} style={{ flex: 1 }} facing="back" pictureSize="640x480" animateShutter={false} />
      </View>
      <Text style={[S.dim, { textAlign: 'center', fontFamily: F.regular }]}>Alice can see this. Ask "what am I looking at?" or "read this to me."</Text>
    </View>
  );
}
