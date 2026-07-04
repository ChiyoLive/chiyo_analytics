<!-- BEGIN:nextjs-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-rules -->

<!-- BEGIN:ui-components-rules -->
# Do NOT Manually Write UI Primitives and Charts
This dashboard utilizes `shadcn/ui`.

Strictly **DO NOT** manually reinvent or code UI primitives (e.g., buttons, dialogs, inputs) that are natively provided by `shadcn/ui`.

Before writing any UI code, strictly adhere to the following guidelines:

## Finding and Installing shadcn UI Primitives
1. **Check Existing Components:** Verify if the required component already exists in the `components/ui/` directory.
2. **On-Demand Installation:** If it does not exist, install it using the following command: `pnpm dlx shadcn@latest add <component-name>`
3. **Reference Documentation:** Use your web browsing capability to check supported components [here](https://ui.shadcn.com/docs/components.md)
4. **Style Override Restriction:** Strictly avoid overriding `shadcn/ui` styles unless absolutely necessary. The project strongly favors using the native, default styles provided out-of-the-box by `shadcn/ui`.

    Bad (Unnecessary custom Tailwind classes overriding default layout/spacing):
    ```tsx
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-semibold text-muted-foreground">
          {translations.visitors}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {overview.visitors.toLocaleString()}
        </div>
      </CardContent>
    </Card>
    ```

    Good (Clean code relying entirely on native component defaults):
    ```tsx
    <Card>
      <CardHeader>
        <CardTitle>
          {translations.visitors}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {overview.visitors.toLocaleString()}
        </div>
      </CardContent>
    </Card>
    ```

## Implementing Charts
1. **Tech Stack:** Charts must be implemented using the `shadcn/ui` chart components integrated with `recharts` v3.
2. **Chart Documentation:** Use your web browsing capability to access the `shadcn/ui` charts documentation [here](https://ui.shadcn.com/docs/components/radix/chart.md)
3. **Chart Examples:** Use your web browsing capability to view reference examples [here](https://ui.shadcn.com/charts/area)
4. **Edge Cases & Exceptions:** Prioritize `shadcn/ui` + `recharts` at all costs. If you encounter an exceptional scenario that cannot be achieved with this stack, you are permitted to install and use `d3.js` for a custom implementation. **However, you MUST ask for user approval and explicit permission before installing or using d3.js.**

## Form State and Input Field Requirements
1. **Mandatory Stack:** Always use `react-hook-form` to manage form states. Use `zod` and `@hookform/resolvers/zod` for form schema validation.
2. **UI Implementation:** Exclusively use `shadcn/ui` `Field` primitives for building the form UI. Use your web browsing capability to view examples [here](https://ui.shadcn.com/docs/components/radix/field.md)
3. **Form Example:** Use your web browsing capability to view `react-hook-form` in `shadcn/ui` examples [here](https://ui.shadcn.com/docs/forms/react-hook-form.md)

## State Management Architecture Rules
1. **Zustand over Context:** When cross-component state sharing or global state management is required, prioritize `zustand`. Do NOT use the React Context API.
2. **Granular Store Pattern:** Implement multiple isolated, feature-specific `zustand` stores on an as-needed basis. Do NOT implement a single, monolithic global store (avoid the Redux-style pattern).
<!-- END:ui-components-rules -->
