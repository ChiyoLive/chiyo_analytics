/**
 * report data, snake_case
 */
export type UtmParams = UtmTraditional &
  UtmGoogle &
  UtmFacebook &
  UtmDomesticAndOthers;

type LowerCaseParams = Map<string, string>;

export function getUtmParams(): UtmParams {
  if (typeof window === "undefined") {
    return {};
  }
  const params = new URLSearchParams(window.location.search);

  const lowerCaseParams: LowerCaseParams = new Map<string, string>();
  for (const [key, value] of params.entries()) {
    lowerCaseParams.set(key.toLowerCase(), value);
  }

  const t = getUtmTraditional(lowerCaseParams);
  const g = getUtmGoogle(lowerCaseParams);
  const f = getUtmFacebook(lowerCaseParams);
  const o = getUtmDomesticAndOthers(lowerCaseParams);

  return {
    ...t,
    ...g,
    ...f,
    ...o,
  };
}

function getSearchParam(
  params: LowerCaseParams,
  name: string,
): string | undefined {
  const v = params.get(name);
  return v ? v : undefined;
}

export type UtmTraditional = {
  // 流量来源
  utm_source?: "google" | "baidu" | "facebook" | "newsletter" | string;
  // 营销媒介
  utm_medium?: "cpc" | "display" | "social" | "email" | string;
  // 广告活动名称
  utm_campaign?: string;
  // 关键词
  utm_term?: string;
  // 广告内容/差异化
  utm_content?: string;
};
function getUtmTraditional(params: LowerCaseParams): UtmTraditional {
  return {
    utm_source: getSearchParam(params, "utm_source"),
    utm_medium: getSearchParam(params, "utm_medium"),
    utm_campaign: getSearchParam(params, "utm_campaign"),
    utm_term: getSearchParam(params, "utm_term"),
    utm_content: getSearchParam(params, "utm_content"),
  };
}

export type UtmGoogle = {
  gclid?: string;
};
function getUtmGoogle(params: LowerCaseParams): UtmGoogle {
  return {
    gclid: getSearchParam(params, "gclid"),
  };
}

export type UtmFacebook = {
  fbclid?: string;
};
function getUtmFacebook(params: LowerCaseParams): UtmFacebook {
  return {
    fbclid: getSearchParam(params, "fbclid"),
  };
}

export type UtmDomesticAndOthers = {
  ttclid?: string; // 抖音/巨量引擎 & TikTok
  blclid?: string; // B站/哔哩哔哩
  bd_vid?: string; // 百度广告
  gdt_vid?: string; // 腾讯广告/广点通 (部分广告主也直接用 clickid)
  msclkid?: string; // 微软/Bing广告
  twclid?: string; // Twitter/X 广告

  clickid?: string; // 兜底通用id
};
function getUtmDomesticAndOthers(
  params: LowerCaseParams,
): UtmDomesticAndOthers {
  return {
    ttclid: getSearchParam(params, "ttclid"),
    blclid: getSearchParam(params, "blclid"),
    bd_vid: getSearchParam(params, "bd_vid"),
    gdt_vid: getSearchParam(params, "gdt_vid"),
    msclkid: getSearchParam(params, "msclkid"),
    twclid: getSearchParam(params, "twclid"),
    clickid: getSearchParam(params, "clickid"),
  };
}
