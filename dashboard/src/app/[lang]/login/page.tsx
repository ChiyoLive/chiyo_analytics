import { I18n } from "@/i18n";
import { PageProps } from "@/types";
import { LoginForm } from "./login-form";

type LoginPageProps = PageProps<{
  params: Promise<{
    lang: string;
  }>;
}>;

function trans(lang: string) {
  return I18n.transDict(lang, [
    "auth:title",
    "auth:email",
    "auth:password",
    "auth:submit",
    "auth:error",
    "auth:invalid_response",
  ] as const);
}

export type LoginTrans = Awaited<ReturnType<typeof trans>>;

export default async function LoginPage({ params }: LoginPageProps) {
  const { lang } = await params;

  // Load translations
  const transLogin = await trans(lang);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black font-sans">
      <LoginForm lang={lang} trans={transLogin} />
    </div>
  );
}
