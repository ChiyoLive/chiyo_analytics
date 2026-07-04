import {
  UI_BANNER_BTN_ACCEPT_ID,
  UI_BANNER_BTN_MORE_OPT_ID,
  UI_BANNER_ROOT_ID,
  UI_DIALOG_ROOT_ID,
  UI_DIALOG_BTN_CLOSE_ID,
  UI_DIALOG_BTN_DECLINE_ID,
  UI_DIALOG_BTN_ACCEPT_ID,
  UI_DIALOG_CB_FUNCTIONAL_ID,
  UI_DIALOG_CB_PERSONALIZATION_ID,
  UI_CLS_THEME_LIGHT,
  UI_CLS_THEME_DARK,
  CONSENT_KEY,
  VISITOR_ID_KEY,
} from "../consts";
import { onHtmlAttributeChange } from "../lib/ui";
import { parseConsent, persistConsentAndApplyStorage } from "../lib/consent";
import { translations } from "./translations";
import type { PrivacyConsent } from "../types";

declare global {
  var __CYANLY_BANNER_HTML: string;
  var __CYANLY_DIALOG_HTML: string;
}

class PrivacyBanner {
  private isRenderCalled = false;
  private isDialogOpen = false;
  private bannerRoot: HTMLElement | null = null;
  private dialogRoot: HTMLElement | null = null;

  render() {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    // 等待 body 渲染完成
    // 因为 mpa 等可能是在 head 里面加载的 script tag
    const waiter = setInterval(() => {
      if (document.body) {
        clearInterval(waiter);

        this.renderImmediately();
      }
    }, 50);
  }

  private renderImmediately() {
    if (typeof localStorage !== "undefined") {
      const storedConsent = localStorage.getItem(CONSENT_KEY);
      if (parseConsent(storedConsent || undefined)) {
        return;
      }
    }

    if (this.isRenderCalled) return;
    this.isRenderCalled = true;

    const { bannerRoot, dialogRoot } = this.createRoots();
    this.bannerRoot = bannerRoot;
    this.dialogRoot = dialogRoot;

    // Append to body first so elements are in the document tree when querying
    document.body.appendChild(bannerRoot);
    document.body.appendChild(dialogRoot);

    // Set content and bind click listeners
    this.updateBannerContent(this.getLangFromHTML());

    // Set up observer for lang and theme style change
    this.setupObserver();
  }

  private setupObserver() {
    onHtmlAttributeChange(["lang", "style", "class"], (name, value) => {
      if (name === "lang") {
        const lang = value || "en";
        this.updateBannerContent(lang);
        if (this.isDialogOpen) {
          this.updateDialogContent(lang);
        }
      } else if (name === "style") {
        this.updateThemeFromHTML();
      } else if (name === "class") {
        this.updateThemeFromHTML();
      }
    });

    // Run initial theme alignment
    this.updateThemeFromHTML();
  }

  private updateThemeFromHTML() {
    if (!this.bannerRoot || !this.dialogRoot) return;
    const styleAttr = document.documentElement.getAttribute("style") || "";
    const classAttr = document.documentElement.getAttribute("class") || "";
    const isDark =
      styleAttr.includes("color-scheme: dark") || classAttr.includes("dark");

    if (isDark) {
      this.bannerRoot.classList.add(UI_CLS_THEME_DARK);
      this.bannerRoot.classList.remove(UI_CLS_THEME_LIGHT);
      this.dialogRoot.classList.add(UI_CLS_THEME_DARK);
      this.dialogRoot.classList.remove(UI_CLS_THEME_LIGHT);
    } else {
      this.bannerRoot.classList.add(UI_CLS_THEME_LIGHT);
      this.bannerRoot.classList.remove(UI_CLS_THEME_DARK);
      this.dialogRoot.classList.add(UI_CLS_THEME_LIGHT);
      this.dialogRoot.classList.remove(UI_CLS_THEME_DARK);
    }
  }

  private updateBannerContent(lang: string) {
    if (!this.bannerRoot) return;
    this.bannerRoot.innerHTML = this.applyI18n(__CYANLY_BANNER_HTML, lang);
    this.bannerRoot.style.display = "";
    this.bindBannerListeners();
  }

  private updateDialogContent(lang: string) {
    if (!this.dialogRoot) return;
    this.dialogRoot.innerHTML = this.applyI18n(__CYANLY_DIALOG_HTML, lang);
    this.bindDialogListeners();
  }

  private getLangFromHTML() {
    if (typeof document === "undefined") return "en";
    return document.documentElement.lang || "en";
  }

  private applyI18n(rawHtml: string, lang: string) {
    let tlang: "zh" | "ja" | "en";
    if (lang.includes("zh")) {
      tlang = "zh";
    } else if (lang.includes("ja")) {
      tlang = "ja";
    } else {
      tlang = "en";
    }

    const trans = translations[tlang];
    let replaced = rawHtml;
    for (const key in trans) {
      const val = trans[key as keyof typeof trans];
      replaced = replaced.replaceAll(`{{${key}}}`, val);
    }

    return replaced;
  }

  private bindBannerListeners() {
    const acceptBtn = document.getElementById(UI_BANNER_BTN_ACCEPT_ID);
    const moreOptBtn = document.getElementById(UI_BANNER_BTN_MORE_OPT_ID);

    acceptBtn?.addEventListener("click", () => {
      this.acceptAll();
    });
    moreOptBtn?.addEventListener("click", () => {
      this.openDialog();
    });
  }

  private openDialog() {
    if (!this.dialogRoot) return;
    this.isDialogOpen = true;
    this.dialogRoot.style.display = "";
    this.updateDialogContent(this.getLangFromHTML());
  }

  private bindDialogListeners() {
    const closeBtn = document.getElementById(UI_DIALOG_BTN_CLOSE_ID);
    const declineBtn = document.getElementById(UI_DIALOG_BTN_DECLINE_ID);
    const acceptBtn = document.getElementById(UI_DIALOG_BTN_ACCEPT_ID);

    // Restore saved states to the switches in the DOM if consent was saved as JSON
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored && stored.startsWith("{")) {
        try {
          const parsed = JSON.parse(stored);
          const cbFunc = document.getElementById(
            UI_DIALOG_CB_FUNCTIONAL_ID,
          ) as HTMLInputElement;
          const cbPers = document.getElementById(
            UI_DIALOG_CB_PERSONALIZATION_ID,
          ) as HTMLInputElement;
          if (cbFunc && parsed.functional !== undefined) {
            cbFunc.checked = parsed.functional;
          }
          if (cbPers && parsed.personalization !== undefined) {
            cbPers.checked = parsed.personalization;
          }
        } catch (e) {
          console.warn("[cyanly] dialog listener", e);
          // ignore parsing error
        }
      }
    }

    closeBtn?.addEventListener("click", () => {
      this.closeDialog();
    });
    declineBtn?.addEventListener("click", () => {
      this.acceptRequiredOnly();
    });
    acceptBtn?.addEventListener("click", () => {
      this.saveSettings();
    });
  }

  private closeDialog() {
    this.isDialogOpen = false;
    if (this.dialogRoot) {
      this.dialogRoot.style.display = "none";
      this.dialogRoot.innerHTML = "";
    }
  }

  private acceptAll() {
    // "Accept All" from the main banner allows functional & personalization completely
    if (
      typeof localStorage !== "undefined" &&
      typeof sessionStorage !== "undefined"
    ) {
      const consent: PrivacyConsent = {
        required: true,
        functional: true,
        personalization: true,
      };
      const vid =
        sessionStorage.getItem(VISITOR_ID_KEY) ||
        localStorage.getItem(VISITOR_ID_KEY) ||
        "";
      persistConsentAndApplyStorage(consent, vid);
    }
    this.closeDialog();
    this.hideBanner();
  }

  private acceptRequiredOnly() {
    // "Accept Required" only allows Required cookies
    if (typeof localStorage !== "undefined") {
      persistConsentAndApplyStorage(
        {
          required: true,
          functional: false,
          personalization: false,
        },
        "",
      );
    }
    this.closeDialog();
    this.hideBanner();
  }

  private saveSettings() {
    if (
      typeof localStorage !== "undefined" &&
      typeof sessionStorage !== "undefined"
    ) {
      const cbFunc = document.getElementById(
        UI_DIALOG_CB_FUNCTIONAL_ID,
      ) as HTMLInputElement;
      const cbPers = document.getElementById(
        UI_DIALOG_CB_PERSONALIZATION_ID,
      ) as HTMLInputElement;

      const functional = cbFunc ? cbFunc.checked : false;
      const personalization = cbPers ? cbPers.checked : false;

      const consent: PrivacyConsent = {
        required: true,
        functional,
        personalization,
      };
      const vid =
        sessionStorage.getItem(VISITOR_ID_KEY) ||
        localStorage.getItem(VISITOR_ID_KEY) ||
        "";
      persistConsentAndApplyStorage(consent, vid);
    }
    this.closeDialog();
    this.hideBanner();
  }

  private hideBanner() {
    this.isRenderCalled = false;
    if (this.bannerRoot) {
      this.bannerRoot.style.display = "none";
      this.bannerRoot.innerHTML = "";
    }
  }

  private createRoots() {
    let bannerRoot: HTMLElement;
    let dialogRoot: HTMLElement;

    const existingBanner = document.getElementById(UI_BANNER_ROOT_ID);
    if (existingBanner) {
      bannerRoot = existingBanner;
    } else {
      bannerRoot = document.createElement("div");
      bannerRoot.id = UI_BANNER_ROOT_ID;
    }

    const existingDialog = document.getElementById(UI_DIALOG_ROOT_ID);
    if (existingDialog) {
      dialogRoot = existingDialog;
    } else {
      dialogRoot = document.createElement("div");
      dialogRoot.id = UI_DIALOG_ROOT_ID;
    }

    bannerRoot.style.display = "none";
    dialogRoot.style.display = "none";

    return { bannerRoot, dialogRoot };
  }
}

export const ui = {
  banner: new PrivacyBanner(),
};
