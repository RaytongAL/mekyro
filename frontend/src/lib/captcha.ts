/**阿里云验证码2.0 前端配置和类型声明。

初始化方式：
1. SDK 加载前设置 window.AliyunCaptchaConfig = { region, prefix }
2. SDK 加载后调用 window.initAliyunCaptcha({ ... })
*/

/**SDK 加载前必须设置的全局配置 */
export interface AliyunCaptchaGlobalConfig {
  /**地区：cn（中国内地）/ sgp（新加坡） */
  region: "cn" | "sgp";
  /**身份标，从阿里云验证码控制台概览页获取 */
  prefix: string;
}

/**initAliyunCaptcha 初始化参数 */
export interface AliyunCaptchaInitOptions {
  /**场景 ID */
  SceneId: string;
  /**验证码模式 */
  mode: "popup" | "embed";
  /**挂载元素选择器 */
  element: string;
  /**触发验证码的元素选择器 */
  button: string;
  /**业务请求回调（验证码通过后调用） */
  captchaVerifyCallback: (captchaVerifyParam: string) => Promise<CaptchaVerifyResult>;
  /**业务结果回调 */
  onBizResultCallback: (bizResult: boolean) => void;
  /**绑定实例函数 */
  getInstance: (instance: AliyunCaptchaInstance) => void;
  /**滑块样式 */
  slideStyle?: { width: number; height: number };
  /**语言 */
  language?: "cn" | "tw" | "en";
}

export interface CaptchaVerifyResult {
  captchaResult: boolean;
  bizResult: boolean;
}

export interface AliyunCaptchaInstance {
  reload(): void;
  destroy(): void;
}

declare global {
  interface Window {
    /**SDK 加载前设置 */
    AliyunCaptchaConfig?: AliyunCaptchaGlobalConfig;
    /**SDK 加载后可用 */
    initAliyunCaptcha?: (options: AliyunCaptchaInitOptions) => void;
  }
}

/**阿里云验证码2.0 配置。

请从阿里云验证码控制台获取：
- prefix：控制台概览页 → 实例基本信息 → 身份标
- SceneId：验证码场景列表 → 场景ID
*/
export const CAPTCHA_CONFIG = {
  prefix: "augdne",
  sceneId: "75iuz5d5",
} as const;
