/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ui } from "../src/ui/index";
import {
  UI_BANNER_BTN_ACCEPT_ID,
  UI_BANNER_BTN_MORE_OPT_ID,
  UI_CLS_BANNER_CONTAINER,
  UI_DIALOG_BTN_CLOSE_ID,
  UI_DIALOG_BTN_DECLINE_ID,
  UI_DIALOG_BTN_ACCEPT_ID,
  UI_DIALOG_CB_FUNCTIONAL_ID,
  UI_DIALOG_CB_PERSONALIZATION_ID,
} from "../src/consts";

// Mock global variables __CYANLY_BANNER_HTML and __CYANLY_DIALOG_HTML dynamically using correct constant values
(globalThis as any).__CYANLY_BANNER_HTML =
  `<div class="${UI_CLS_BANNER_CONTAINER}"><button id="${UI_BANNER_BTN_ACCEPT_ID}">Accept</button><button id="${UI_BANNER_BTN_MORE_OPT_ID}">More Options</button></div>`;
(globalThis as any).__CYANLY_DIALOG_HTML = `<div>
  <button id="${UI_DIALOG_BTN_CLOSE_ID}">x</button>
  <input type="checkbox" id="${UI_DIALOG_CB_FUNCTIONAL_ID}" checked />
  <input type="checkbox" id="${UI_DIALOG_CB_PERSONALIZATION_ID}" checked />
  <button id="${UI_DIALOG_BTN_DECLINE_ID}">Decline</button>
  <button id="${UI_DIALOG_BTN_ACCEPT_ID}">Accept All</button>
</div>`;

describe("Privacy Banner UI Component (Node Mocked)", () => {
  let mockDocument: any;
  let mockWindow: any;
  let originalDocument: any;
  let originalWindow: any;
  let originalLocalStorage: any;
  let originalSessionStorage: any;
  let elementMap: Map<string, any>;

  beforeEach(() => {
    originalDocument = (globalThis as any).document;
    originalWindow = (globalThis as any).window;
    originalLocalStorage = (globalThis as any).localStorage;
    originalSessionStorage = (globalThis as any).sessionStorage;

    elementMap = new Map();

    const mockElement = (id = "") => {
      const el = {
        id,
        style: { display: "" },
        innerHTML: "",
        checked: true,
        addEventListener: vi.fn(),
        appendChild: vi.fn(),
        querySelector: vi.fn(),
        closest: vi.fn(),
        getAttribute: vi.fn(),
        removeAttribute: vi.fn(),
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      };
      if (id) {
        elementMap.set(id, el);
      }
      return el;
    };

    mockDocument = {
      getElementById: vi.fn().mockImplementation((id) => {
        if (elementMap.has(id)) {
          return elementMap.get(id);
        }
        return mockElement(id);
      }),
      createElement: vi.fn().mockImplementation(() => mockElement()),
      body: {
        appendChild: vi.fn(),
      },
      documentElement: {
        lang: "en",
        getAttribute: vi.fn().mockReturnValue("color-scheme: dark;"),
      },
      addEventListener: vi.fn(),
    };

    mockWindow = {
      location: { href: "http://localhost" },
      addEventListener: vi.fn(),
      doNotTrack: undefined,
    };

    (globalThis as any).document = mockDocument;
    (globalThis as any).window = mockWindow;

    class MockMutationObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("MutationObserver", MockMutationObserver);

    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).sessionStorage = originalSessionStorage;
    vi.restoreAllMocks();
  });

  it("should not render if consent is already set in localStorage as JSON", async () => {
    vi.spyOn(localStorage, "getItem").mockReturnValue(
      '{"required":true,"functional":true,"personalization":true}',
    );

    ui.banner.render();

    await vi.waitFor(() => {
      expect(mockDocument.body.appendChild).not.toHaveBeenCalled();
    });
  });

  it("should render if consent is not set", async () => {
    vi.spyOn(localStorage, "getItem").mockReturnValue(null);

    ui.banner.render();

    await vi.waitFor(() => {
      expect(mockDocument.body.appendChild).toHaveBeenCalled();
    });
  });
});
