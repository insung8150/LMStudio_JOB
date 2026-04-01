export const LM_STUDIO_HOST = process.env.LM_STUDIO_HOST || "localhost";
export const LM_STUDIO_PORT = process.env.LM_STUDIO_PORT || "1234";
export const LM_STUDIO_URL = `http://${LM_STUDIO_HOST}:${LM_STUDIO_PORT}`;

export const LMS_CLI_PATH =
  process.env.LMS_CLI_PATH || "/home/yooha/.lmstudio/bin/lms";

export const CONVERSATIONS_DIR =
  process.env.CONVERSATIONS_DIR || "/home/yooha/.lmstudio/conversations";

export const SERVER_LOGS_DIR =
  process.env.SERVER_LOGS_DIR || "/home/yooha/.lmstudio/server-logs";

// 폴링 간격 (ms)
export const GPU_POLL_INTERVAL = 3000;
export const MODEL_POLL_INTERVAL = 10000;
export const CONVERSATION_POLL_INTERVAL = 30000;
