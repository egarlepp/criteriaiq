import { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  className?: string;
}

export function OpenAIIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.4069-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

export function AnthropicIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M17.3037 3.5H13.5713L19.2799 20.5H23.0123L17.3037 3.5ZM0.987793 20.5H4.87851L6.02332 17.4144H12.2678L13.4127 20.5H17.3033L11.1629 3.5H7.12823L0.987793 20.5ZM7.1572 14.2021L9.14548 8.53651L11.1338 14.2021H7.1572Z" />
    </svg>
  );
}

export function GeminiIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M12 24A14.304 14.304 0 0 0 24 12 14.304 14.304 0 0 0 12 0 14.304 14.304 0 0 0 0 12a14.304 14.304 0 0 0 12 12z" />
    </svg>
  );
}

export function XAIIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M2.22571 21.7069L10.3454 12.0003L2.22571 2.29297H5.81286L11.8126 9.66812C12.1577 10.0953 12.5029 10.5225 12.848 10.9497L12.1577 10.9131C12.5029 10.4859 12.848 10.0587 13.1931 9.63155L19.1929 2.29297H22.78L14.6603 12.0003L22.78 21.7069H19.1929L13.1931 14.3317C12.848 13.9045 12.5029 13.4773 12.1577 13.0501L12.848 13.0867C12.5029 13.5139 12.1577 13.9411 11.8126 14.3683L5.81286 21.7069H2.22571Z" />
    </svg>
  );
}

export function AzureOpenAIIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M5.48657 3.19531L0.0786133 18.0699H4.04867L4.85521 15.6313H9.54174L10.3483 18.0699H14.3184L8.89392 3.19531H5.48657ZM5.68891 12.7549L7.19848 8.15908L8.70804 12.7549H5.68891Z" />
      <path d="M13.6279 18.0694V3.19531H17.2981V18.0694H13.6279Z" />
      <path d="M19.0962 18.0694V3.19531H23.9219V6.02345H22.7664V18.0694H19.0962Z" />
    </svg>
  );
}

// Webhook AI provider — generic HTTP-endpoint provider that proxies
// completions through whatever the operator points it at (n8n,
// Lambda, Azure AI Foundry router, internal LLM gateway). Drawn as a
// simple link/socket glyph rather than a vendor mark since the
// downstream is operator-chosen.
export function WebhookIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
    </svg>
  );
}

export const AI_PROVIDER_ICONS: Record<string, React.FC<IconProps>> = {
  openai: OpenAIIcon,
  gemini: GeminiIcon,
  anthropic: AnthropicIcon,
  xai: XAIIcon,
  azure_openai: AzureOpenAIIcon,
  webhook: WebhookIcon,
};

export const AI_PROVIDER_COLORS: Record<string, { color: string; bgColor: string }> = {
  openai: { color: '#10A37F', bgColor: 'bg-green-50 dark:bg-green-950' },
  gemini: { color: '#4285F4', bgColor: 'bg-blue-50 dark:bg-blue-950' },
  anthropic: { color: '#D97706', bgColor: 'bg-orange-50 dark:bg-orange-950' },
  xai: { color: '#000000', bgColor: 'bg-gray-50 dark:bg-gray-950' },
  azure_openai: { color: '#0078D4', bgColor: 'bg-blue-50 dark:bg-blue-950' },
  webhook: { color: '#7C3AED', bgColor: 'bg-purple-50 dark:bg-purple-950' },
};
