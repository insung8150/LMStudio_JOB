// GPU 정보
export interface GpuInfo {
  index: number;
  name: string;
  memoryUsedMiB: number;
  memoryTotalMiB: number;
  utilizationPercent: number;
  temperatureC: number;
}

// 로드된 모델
export interface LoadedModel {
  identifier: string;
  model: string;
  status: string;
  size: string;
  context: number;
  ttl: string;
}

// LM Studio 상세 모델 정보
export interface DetailedModel {
  type: string;
  publisher: string;
  key: string;
  display_name: string;
  architecture: string;
  quantization?: { name: string; bits_per_weight: number };
  size_bytes: number;
  params_string: string;
  max_context_length: number;
  format: string;
  capabilities?: { vision: boolean; trained_for_tool_use: boolean };
  loaded_instances: unknown[];
}

// 대화 파일 구조
export interface ConversationFile {
  name: string;
  pinned: boolean;
  createdAt: number;
  tokenCount: number;
  userLastMessagedAt: number;
  assistantLastMessagedAt: number;
  systemPrompt: string;
  messages: ConversationMessage[];
  lastUsedModel?: {
    identifier: string;
    indexedModelIdentifier?: string;
  };
}

export interface ConversationMessage {
  versions: MessageVersion[];
  currentlySelected: number;
}

export interface MessageVersion {
  type: "singleStep" | "multiStep";
  role: "user" | "assistant" | "system";
  content?: ContentBlock[] | string;
  steps?: AssistantStep[];
  senderInfo?: { senderName: string };
}

export interface ContentBlock {
  type: "text" | "file";
  text?: string;
  fileIdentifier?: string;
  fileType?: string;
  sizeBytes?: number;
}

export interface AssistantStep {
  type: "contentBlock" | "debugInfoBlock";
  content?: ContentBlock[];
  genInfo?: {
    identifier: string;
    stats?: GenInfoStats;
  };
}

export interface GenInfoStats {
  tokensPerSecond: number;
  totalTimeSec: number;
  promptTokensCount: number;
  predictedTokensCount: number;
  stopReason: string;
}

// 대화 목록용 요약
export interface ConversationSummary {
  id: string;
  name: string;
  createdAt: number;
  tokenCount: number;
  messageCount: number;
  modelName: string;
  systemPromptPreview: string;
}

// 로그 스트림 이벤트
export interface LogStreamEvent {
  timestamp: number;
  data: {
    type: "llm.prediction.input" | "llm.prediction.output";
    input?: string;
    output?: string;
    stats?: {
      stopReason: string;
      tokensPerSecond: number;
      numGpuLayers: number;
      timeToFirstTokenSec: number;
      totalTimeSec: number;
      promptTokensCount: number;
      predictedTokensCount: number;
      totalTokensCount: number;
    };
    modelIdentifier?: string;
  };
}

// 서버 로그 엔트리
export interface ServerLogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
}
