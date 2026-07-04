import "server-only";

const translations = {
  en: () => import("./translations/en.json").then((m) => m.default),
  zh: () => import("./translations/zh.json").then((m) => m.default),
  ja: () => import("./translations/ja.json").then((m) => m.default),
};

/**
 * key 是平铺的语义化设计，通过 en.json 获得实际的英文原文。
 * 如果对应的语言（如 zh/ja）中缺失该 key，则自动回退至 en.json 中的内容；若 en.json 中也缺失，则返回 key 自身。
 */
export class I18n {
  static async trans(lang: string, key: string): Promise<string> {
    const mod = translations[lang as keyof typeof translations];
    if (mod) {
      const trans = await mod();
      if (trans[key as keyof typeof trans]) {
        return trans[key as keyof typeof trans];
      }
    }

    if (lang !== "en") {
      const enMod = translations["en"];
      if (enMod) {
        const enTrans = await enMod();
        if (enTrans[key as keyof typeof enTrans]) {
          return enTrans[key as keyof typeof enTrans];
        }
      }
    }

    return key;
  }

  static async transList(lang: string, keys: string[]): Promise<string[]> {
    const mod = translations[lang as keyof typeof translations];
    const trans = mod ? await mod() : null;

    const enMod = lang !== "en" ? translations["en"] : null;
    const enTrans = enMod ? await enMod() : null;

    return keys.map((key) => {
      if (trans && trans[key as keyof typeof trans]) {
        return trans[key as keyof typeof trans];
      }
      if (enTrans && enTrans[key as keyof typeof enTrans]) {
        return enTrans[key as keyof typeof enTrans];
      }
      return key;
    });
  }

  static async transDict<K extends readonly string[]>(
    lang: string,
    keys: K,
  ): Promise<{ [P in K[number]]: string }> {
    const result = {} as { [P in K[number]]: string };

    const mod = translations[lang as keyof typeof translations];
    const trans = mod ? await mod() : null;

    const enMod = lang !== "en" ? translations["en"] : null;
    const enTrans = enMod ? await enMod() : null;

    for (const key of keys) {
      let val = key as string;
      if (trans && trans[key as keyof typeof trans]) {
        val = trans[key as keyof typeof trans];
      } else if (enTrans && enTrans[key as keyof typeof enTrans]) {
        val = enTrans[key as keyof typeof enTrans];
      }
      result[key as K[number]] = val;
    }

    return result;
  }
}
