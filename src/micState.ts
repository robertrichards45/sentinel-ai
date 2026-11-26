/**
 * Is Alice using a microphone right now (phone mic, or the glasses' mic through the iPhone when they are
 * connected as headphones)? While she is, the glasses raise their "busy" flag for the MIC, not the camera,
 * so the camera warning and the "Recording video" announcement must stay quiet.
 */
let phoneMic = false;
let lastOff = 0;
export const setPhoneMic = (on: boolean) => { if (phoneMic && !on) lastOff = Date.now(); phoneMic = on; };
/** True while Alice listens, and for 3 s after (the glasses lower their flag a little late). */
export const appMicBusy = () => phoneMic || Date.now() - lastOff < 3000;
