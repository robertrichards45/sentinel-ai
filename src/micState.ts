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

/** Set by glassesVoice: lets the camera warning know a glasses conversation is running. */
let sessionCheck: () => boolean = () => false;
export const setSessionCheck = (fn: () => boolean) => { sessionCheck = fn; };
/** Busy flag means "microphone", not "camera", while either of these is true. */
export const micExplainsBusy = () => appMicBusy() || sessionCheck() || Date.now() - lastSession < 5000;
let lastSession = 0;
setInterval(() => { if (sessionCheck()) lastSession = Date.now(); }, 500);
