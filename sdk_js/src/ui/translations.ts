const en = {
  banner_text: "We use cookies to optimize your experience.",
  accept: "Accept All",
  more_options: "More Options",
  dialog_title: "Privacy Settings",
  dialog_text: "Please choose whether this site may use Functional and/or Personalization cookies, as described below.",
  accept_required: "Accept Required",
  save_settings: "Accept Custom Settings",
  close: "Close",
  required_title: "Required cookies",
  required_desc: "These cookies are needed to provide basic functionalities as you browse websites. These capabilities include cookie preferences, session management, language selection and anonymous event logging.",
  functional_title: "Functional cookies",
  functional_desc: "These cookies are used to capture and remember user preferences, enhance their usability, analyze site usage and enable site optimization.",
  personalization_title: "Personalization cookies",
  personalization_desc: "These cookies enable cross-session tracking via a persistent identifier to analyze your repeat visits and optimize content delivery over time.",
};
type Translations = Record<keyof typeof en, string>;

const zh: Translations = {
  banner_text: "我们使用 Cookie 来优化您的体验。",
  accept: "允许全部",
  more_options: "更多选项",
  dialog_title: "隐私设置",
  dialog_text: "请选择本网站是否可以使用功能性和/或个性化 Cookie，详情如下。",
  accept_required: "仅接受必要",
  save_settings: "接受自定义设置",
  close: "关闭",
  required_title: "必要 Cookie",
  required_desc: "这些 Cookie 是您浏览网站时提供基本功能所必需的。这些功能包括 Cookie 首选项、会话管理、语言选择和匿名事件日志。",
  functional_title: "功能性 Cookie",
  functional_desc: "这些 Cookie 用于捕获和记住用户首选项、增强其可用性、分析网站使用情况并实现网站优化。",
  personalization_title: "个性化 Cookie",
  personalization_desc: "这些 Cookie 允许通过持久标识符进行跨会话追踪，以分析您的重复访问并优化内容呈现。",
};

const ja: Translations = {
  banner_text: "クッキーを使用して体験を最適化します。",
  accept: "すべて同意",
  more_options: "詳細設定",
  dialog_title: "プライバシー設定",
  dialog_text: "以下に説明するように、このサイトが機能性クッキーおよび/またはパーソライズクッキーを使用できるかどうかを選択してください。",
  accept_required: "必須のみ同意",
  save_settings: "カスタム設定を保存",
  close: "閉じる",
  required_title: "必須クッキー",
  required_desc: "これらのクッキーは、ウェブサイトを閲覧する際に基本的な機能を提供するために必要です。これには、クッキー設定、セッション管理、言語選択、匿名のイベントログが含まれます。",
  functional_title: "機能性クッキー",
  functional_desc: "これらのクッキーは、ユーザー設定の取得と記憶、ユーザビリティの向上、サイト利用状況の分析、およびサイトの最適化に使用されます。",
  personalization_title: "パーソナライズクッキー",
  personalization_desc: "これらのクッキーは、パーシステント識別子を介したクロスセッショントラッキングを可能にし、リピート訪問を分析してコンテンツ配信を最適化します。",
};

export const translations: Record<string, Translations> = {
  en,
  zh,
  ja,
};
