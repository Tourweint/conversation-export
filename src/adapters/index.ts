export { PlatformAdapter, adapterRegistry } from './base';
export { DeepSeekAdapter } from './deepseek';
export { ChatGPTAdapter } from './chatgpt';
export { KimiAdapter } from './kimi';
export { QwenAdapter } from './qwen';

// 自动注册所有适配器
import './deepseek';
import './chatgpt';
import './kimi';
import './qwen';
